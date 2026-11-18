import type { Prisma } from "@/generated/prisma/client";

// Search runs on a stored, normalized copy of title + AI summary. SQLite's
// LIKE only ignores case for ASCII, so "Łódź" ≠ "łódź" and "pokemon" never
// finds "Pokémon" — normalizing both the stored text and the query to
// lowercase without diacritics fixes that. The summary matters because it's
// written in the reader's language: the sources are English, but a Polish
// query like "wyciek danych" should still find the story.

export function normalizeForSearch(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      // ł doesn't decompose into l + a mark, so NFKD leaves it alone
      .replace(/ł/g, "l")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function searchTextFor(title: string, summary: string | null): string {
  return normalizeForSearch(summary ? `${title} ${summary}` : title);
}

// every word has to appear somewhere, in any order
export function searchFilter(query: string): Prisma.ArticleWhereInput {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return {};
  return { AND: words.map((word) => ({ searchText: { contains: word } })) };
}
