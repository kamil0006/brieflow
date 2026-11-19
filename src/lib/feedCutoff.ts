import type { Prisma } from "@/generated/prisma/client";

// articles are shared between accounts, but each one only sees news fetched
// up to its own last refresh (User.feedCutoff) — so one person's refresh
// never changes what the other sees until they refresh themselves
export function fetchedByCutoff(feedCutoff: Date): Prisma.ArticleWhereInput {
  return { fetchedAt: { lte: feedCutoff } };
}
