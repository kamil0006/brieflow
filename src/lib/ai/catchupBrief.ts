import OpenAI from "openai";
import { topicsList, visibleCategories } from "@/lib/ai/brief";
import { languageDirective } from "@/lib/ai/languageDirective";
import type { Category } from "@/lib/categories";
import { visibleCategoriesFilter } from "@/lib/categoryPrefs";
import { visibleContentFilter } from "@/lib/contentFilter";
import { fetchedByCutoff } from "@/lib/feedCutoff";
import type { Locale } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// The catch-up shows on every homepage load until the browser reports the
// visit, so without a cache each reload (or a script skipping that report)
// would pay for a fresh summary. Same person + same "since" + same settings
// gives the same answer anyway.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
type CacheEntry = { value: Promise<string | null>; expiresAt: number };
const globalForCatchUp = globalThis as unknown as { catchUpCache: Map<string, CacheEntry> | undefined };
const catchUpCache = (globalForCatchUp.catchUpCache ??= new Map());

const systemPrompt = (topics: string) => `Piszesz krótkie podsumowanie "co przegapiłeś" dla osoby, która śledzi te tematy: ${topics}, i nie zaglądała do newsów od jakiegoś czasu.

Jeden akapit, 3-5 zdań, bez wypunktowań, bez cytowania tytułów dosłownie. Skup się na tym, co najważniejsze — pomiń drobiazgi. Ton: konkretny, rzeczowy, jakbyś wprowadzał kogoś w temat po jego nieobecności.`;

export function generateCatchUpBrief(
  userId: string,
  since: Date,
  locale: Locale = "pl",
  hiddenCategories: Category[],
  feedCutoff: Date,
): Promise<string | null> {
  const key = [userId, since.getTime(), feedCutoff.getTime(), locale, [...hiddenCategories].sort().join(",")].join("|");
  const now = Date.now();
  const cached = catchUpCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  for (const [k, entry] of catchUpCache) {
    if (entry.expiresAt <= now) catchUpCache.delete(k);
  }
  if (catchUpCache.size >= MAX_CACHE_ENTRIES) {
    catchUpCache.delete(catchUpCache.keys().next().value!);
  }

  // the promise itself is cached so parallel loads share one request; a
  // failure is dropped so the next load can try again
  const value = buildCatchUpBrief(userId, since, locale, hiddenCategories, feedCutoff);
  catchUpCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  value.catch(() => catchUpCache.delete(key));
  return value;
}

async function buildCatchUpBrief(
  userId: string,
  since: Date,
  locale: Locale,
  hiddenCategories: Category[],
  feedCutoff: Date,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const top = await prisma.article.findMany({
    where: {
      AND: [
        { classifiedAt: { not: null }, duplicateOfId: null },
        { NOT: { articleStates: { some: { userId, dismissed: true } } } },
        visibleContentFilter(),
        visibleCategoriesFilter(hiddenCategories),
        fetchedByCutoff(feedCutoff),
        {
          OR: [
            { publishedAt: { gte: since } },
            { publishedAt: null, fetchedAt: { gte: since } },
          ],
        },
      ],
    },
    orderBy: [{ priority: "desc" }],
    take: 15,
    select: { title: true, category: true, priority: true, summary: true },
  });

  if (top.length === 0) return null;

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          systemPrompt(topicsList(visibleCategories(hiddenCategories), "pl")) +
          languageDirective(locale),
      },
      {
        role: "user",
        content: JSON.stringify(
          top.map((a) => ({
            title: a.title,
            category: a.category,
            priority: a.priority,
            summary: a.summary,
          })),
        ),
      },
    ],
  });

  return response.choices[0]?.message.content?.trim() ?? null;
}
