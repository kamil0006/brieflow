import type { Prisma } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/searchText";

// Phrases an account doesn't want to see ("GTA 6", "crypto"). Matched
// against the article's searchText (title + AI summary, lowercase, no
// diacritics) from the start of a word: "gta" catches "GTA 6" and "(GTA",
// "ai" doesn't catch "said". Stored as typed, one per line, compared
// normalized.

export const MAX_MUTED_KEYWORDS = 50;
export const MAX_KEYWORD_LENGTH = 60;

// characters that can sit right before a word in a title or summary
const WORD_STARTS = [" ", "(", "[", '"', "'", "‘", "“", "„", "«", "-", "/", "#", "@"];

export function parseMutedKeywords(raw: string): string[] {
  return raw
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function serializeMutedKeywords(keywords: string[]): string {
  return keywords.join("\n");
}

function normalizedKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map(normalizeForSearch).filter(Boolean))];
}

// adds a phrase unless it's empty, too long, already there (ignoring case
// and diacritics) or the list is full — returns the list unchanged then
export function addMutedKeyword(keywords: string[], raw: string): string[] {
  const keyword = raw.replace(/\s+/g, " ").trim();
  if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) return keywords;
  if (keywords.length >= MAX_MUTED_KEYWORDS) return keywords;
  const normalized = normalizeForSearch(keyword);
  if (keywords.some((k) => normalizeForSearch(k) === normalized)) return keywords;
  return [...keywords, keyword];
}

export function removeMutedKeyword(keywords: string[], keyword: string): string[] {
  return keywords.filter((k) => k !== keyword);
}

// same rule as mutedKeywordsFilter, for code and tests outside the database
export function matchesMutedKeyword(searchText: string, keywords: string[]): boolean {
  return normalizedKeywords(keywords).some(
    (k) => searchText.startsWith(k) || WORD_STARTS.some((p) => searchText.includes(p + k)),
  );
}

// articles without searchText (saved before the column existed) stay
// visible — there's nothing to match them against
export function mutedKeywordsFilter(keywords: string[]): Prisma.ArticleWhereInput {
  const normalized = normalizedKeywords(keywords);
  if (normalized.length === 0) return {};
  const matches: Prisma.ArticleWhereInput[] = normalized.flatMap((k) => [
    { searchText: { startsWith: k } },
    ...WORD_STARTS.map((p) => ({ searchText: { contains: p + k } })),
  ]);
  return { OR: [{ searchText: null }, { NOT: { OR: matches } }] };
}
