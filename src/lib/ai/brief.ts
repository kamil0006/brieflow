import OpenAI from "openai";
import { languageDirective } from "@/lib/ai/languageDirective";
import { CATEGORIES, type Category, categoryLabel } from "@/lib/categories";
import { visibleContentFilter } from "@/lib/contentFilter";
import { fetchedByCutoff } from "@/lib/feedCutoff";
import type { Locale } from "@/lib/i18n/locale";
import { mutedKeywordsFilter } from "@/lib/mutedKeywords";
import { prisma } from "@/lib/prisma";
import { normalizeForSearch } from "@/lib/searchText";
import { recordAiUsage } from "@/lib/aiUsage";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TOP_ARTICLES = 12;
// briefs are a per-day cache — a week of history is plenty
const KEEP_DAYS = 7;

// the reader's own topics go into the prompt, so a brief for someone
// following entertainment and science doesn't read like a tech newsletter
export function briefSystemPrompt(topics: string): string {
  return `Piszesz krótki, rzeczowy przegląd dnia dla osoby, która śledzi te tematy: ${topics}.

Jeden akapit, 3-5 zdań, bez wypunktowań i bez cytowania tytułów newsów dosłownie — syntetyzuj, wskaż co dominuje dziś w newsach i co jest najbardziej istotne. Jeśli newsy dotyczą kilku tematów, zaznacz najważniejsze z każdego, zamiast skupiać się tylko na jednym. Ton: konkretny, bez lania wody, bez marketingowego zadęcia.`;
}

export function visibleCategories(hidden: Category[]): Category[] {
  return CATEGORIES.filter((c) => !hidden.includes(c));
}

export function topicsList(categories: Category[], locale: Locale): string {
  return categories.map((c) => categoryLabel(c, locale)).join(", ");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// accounts with the same language, the same visible categories, the same
// muted phrases and the same last refresh get the same brief, so it's
// generated once for all of them
export function briefKey(
  date: string,
  locale: Locale,
  categories: Category[],
  feedCutoff: Date,
  mutedKeywords: string[] = [],
): string {
  const base = `${date}|${locale}|${[...categories].sort().join(",")}|${feedCutoff.getTime()}`;
  const muted = [...new Set(mutedKeywords.map(normalizeForSearch))].sort();
  return muted.length > 0 ? `${base}|${muted.join(",")}` : base;
}

async function generateBrief(
  categories: Category[],
  mutedKeywords: string[],
  locale: Locale,
  feedCutoff: Date,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || categories.length === 0) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // shared per settings, not per account — so per-user dismissals don't filter it
  const top = await prisma.article.findMany({
    where: {
      AND: [
        { classifiedAt: { not: null }, duplicateOfId: null, fetchedAt: { gte: since } },
        { category: { in: categories } },
        visibleContentFilter(),
        mutedKeywordsFilter(mutedKeywords),
        fetchedByCutoff(feedCutoff),
      ],
    },
    orderBy: [{ priority: "desc" }],
    take: TOP_ARTICLES,
    select: { title: true, category: true, priority: true, summary: true },
  });

  if (top.length === 0) return null;

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: briefSystemPrompt(topicsList(categories, "pl")) + languageDirective(locale),
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
  await recordAiUsage("brief", response.model ?? MODEL, response.usage);

  return response.choices[0]?.message.content?.trim() || null;
}

// today's brief for these settings — from the cache, or generated now
export async function getOrCreateDailyBrief(
  hiddenCategories: Category[],
  mutedKeywords: string[],
  locale: Locale,
  feedCutoff: Date,
): Promise<string | null> {
  const categories = visibleCategories(hiddenCategories);
  const date = todayKey();
  const key = briefKey(date, locale, categories, feedCutoff, mutedKeywords);

  const cached = await prisma.dailyBrief.findUnique({ where: { key } });
  if (cached) return cached.content;

  const content = await generateBrief(categories, mutedKeywords, locale, feedCutoff);
  if (!content) return null;

  // upsert: two people with the same settings may open the page at once
  await prisma.dailyBrief.upsert({
    where: { key },
    create: { key, date, content },
    update: { content },
  });
  return content;
}

// after a scrape the cached briefs are out of date — drop today's (each is
// regenerated on its next view) and anything older than a week
export async function invalidateDailyBriefs(): Promise<void> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await prisma.dailyBrief.deleteMany({
    where: { OR: [{ date: todayKey() }, { date: { lt: cutoff } }] },
  });
}
