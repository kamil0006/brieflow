import { cache } from "react";
import { generateKeyPoints } from "@/lib/ai/keyPoints";
import { extractReadableBlocks, type ReaderBlock } from "@/lib/extract";
import type { Locale } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";
import { envNumber, takeToken } from "@/lib/rateLimit";

// a failed extraction (paywall, JS-only page) is retried after a day at most
const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;
const WORDS_PER_MINUTE = 220;
// the classifier's stored excerpt is good enough for key points when the
// page itself couldn't be read
const MIN_FALLBACK_CHARS = 600;
// stored points are free; this only caps how many new ones one account can
// have generated per hour (e.g. a script walking through every article)
const KEY_POINTS_PER_HOUR = envNumber("KEY_POINTS_LIMIT_PER_HOUR", 60);
const HOUR_MS = 60 * 60 * 1000;

// key points are stored per language ({"pl": [...], "en": [...]}) so
// switching languages doesn't pay for the same article again. Older rows
// hold a plain array in the language named by readerLocale.
type StoredKeyPoints = Partial<Record<Locale, string[]>>;

export function parseStoredKeyPoints(raw: string | null, legacyLocale: string | null): StoredKeyPoints {
  const parsed = parseJson<unknown>(raw);
  if (Array.isArray(parsed)) {
    return legacyLocale === "pl" || legacyLocale === "en" ? { [legacyLocale]: parsed as string[] } : {};
  }
  if (parsed && typeof parsed === "object") {
    const result: StoredKeyPoints = {};
    for (const locale of ["pl", "en"] as const) {
      const points = (parsed as Record<string, unknown>)[locale];
      if (Array.isArray(points) && points.every((p) => typeof p === "string")) result[locale] = points;
    }
    return result;
  }
  return {};
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readingMinutes(blocks: ReaderBlock[]): number {
  const words = blocks.reduce((sum, b) => sum + b.x.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// The article text and the key points are loaded separately so the page can
// stream the text first (~1s) and the AI points after (~3-4s). `cache`
// dedupes the shared work within one request.

export const getReaderBlocks = cache(async (articleId: string): Promise<ReaderBlock[] | null> => {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { url: true, readerText: true, readerFetchedAt: true },
  });
  if (!article) return null;

  const stored = parseJson<ReaderBlock[]>(article.readerText);
  const shouldFetch =
    !article.readerFetchedAt ||
    (!stored && Date.now() - article.readerFetchedAt.getTime() > RETRY_FAILED_AFTER_MS);
  if (!shouldFetch) return stored;

  const blocks = await extractReadableBlocks(article.url);
  await prisma.article.update({
    where: { id: articleId },
    data: {
      readerText: blocks ? JSON.stringify(blocks) : null,
      readerFetchedAt: new Date(),
      // new text → old key points no longer apply
      readerKeyPoints: null,
      readerLocale: null,
    },
  });
  return blocks;
});

// fetched once and stored — the text is shared by every account, only the
// key points depend on the language
export const getReaderKeyPoints = cache(
  async (articleId: string, userId: string, locale: Locale): Promise<string[] | null> => {
    const blocks = await getReaderBlocks(articleId);

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { title: true, content: true, readerKeyPoints: true, readerLocale: true },
    });
    if (!article) return null;

    const stored = parseStoredKeyPoints(article.readerKeyPoints, article.readerLocale);
    if (stored[locale]) return stored[locale];

    const sourceText = blocks
      ? blocks.map((b) => b.x).join("\n\n")
      : (article.content?.length ?? 0) >= MIN_FALLBACK_CHARS
        ? article.content
        : null;
    if (!sourceText) return null;

    // over the limit the reader falls back to the article's summary
    if (!takeToken(`keyPoints:${userId}`, KEY_POINTS_PER_HOUR, HOUR_MS).ok) return null;

    let keyPoints: string[] | null = null;
    try {
      keyPoints = await generateKeyPoints(article.title, sourceText, locale);
    } catch {
      // the reader still works without key points — the text is the point
      return null;
    }
    if (keyPoints) {
      await prisma.article.update({
        where: { id: articleId },
        data: { readerKeyPoints: JSON.stringify({ ...stored, [locale]: keyPoints }), readerLocale: null },
      });
    }
    return keyPoints;
  },
);
