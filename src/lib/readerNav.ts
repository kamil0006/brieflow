import type { Prisma } from "@/generated/prisma/client";
import type { Category } from "@/lib/categories";
import { loadDemotions, rankedFeedIds } from "@/lib/personalPriority";
import { visibleContentFilter } from "@/lib/contentFilter";
import { fetchedByCutoff } from "@/lib/feedCutoff";
import { type FeedFilters, mainFeedWhere, pickUpcoming } from "@/lib/feed";
import { freshnessFilter } from "@/lib/freshness";
import { prisma } from "@/lib/prisma";

const MAX_RELATED = 6;
// "next" plus a few more behind the expandable list
const UPCOMING_COUNT = 5;

const cardSelect = {
  id: true,
  title: true,
  summary: true,
  sourceName: true,
  category: true,
  priority: true,
  publishedAt: true,
} satisfies Prisma.ArticleSelect;

export type ReaderCard = Prisma.ArticleGetPayload<{ select: typeof cardSelect }>;

// the next unread articles of the list the reader was opened from — [0] is
// "next", the rest go into the expandable list
export async function getUpcomingArticles({
  userId,
  current,
  filters,
  hiddenCategories,
  mutedKeywords,
  feedCutoff,
}: {
  userId: string;
  current: { id: string };
  filters: FeedFilters;
  hiddenCategories: Category[];
  mutedKeywords: string[];
  feedCutoff: Date;
}): Promise<ReaderCard[]> {
  // same order as the feed — by this account's own priority
  const ids = await rankedFeedIds(
    mainFeedWhere({ userId, filters, hiddenCategories, mutedKeywords, dateFilter: freshnessFilter(), feedCutoff }),
    await loadDemotions(userId),
    // +1 in case the open article is still in the feed (not marked read yet)
    UPCOMING_COUNT + 1,
  );
  const found = await prisma.article.findMany({ where: { id: { in: ids } }, select: cardSelect });
  const byId = new Map(found.map((a) => [a.id, a]));
  const candidates = ids.map((id) => byId.get(id)).filter((a) => a !== undefined);
  return pickUpcoming(current, candidates, UPCOMING_COUNT);
}

export type RelatedItem = {
  id: string;
  title: string;
  sourceName: string;
  publishedAt: Date | null;
  read: boolean;
};

// other coverage of the same story: articles in the same thread, plus
// duplicates from other sources (either way round)
export async function getRelatedArticles({
  userId,
  current,
  feedCutoff,
}: {
  userId: string;
  current: { id: string; threadId: string | null; duplicateOfId: string | null };
  feedCutoff: Date;
}): Promise<RelatedItem[]> {
  const sameStory: Prisma.ArticleWhereInput[] = [{ duplicateOfId: current.id }];
  if (current.threadId) sameStory.push({ threadId: current.threadId });
  if (current.duplicateOfId) {
    sameStory.push({ id: current.duplicateOfId }, { duplicateOfId: current.duplicateOfId });
  }

  const rows = await prisma.article.findMany({
    where: {
      AND: [
        { id: { not: current.id }, OR: sameStory },
        { NOT: { articleStates: { some: { userId, dismissed: true } } } },
        visibleContentFilter(),
        fetchedByCutoff(feedCutoff),
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: MAX_RELATED,
    select: {
      id: true,
      title: true,
      sourceName: true,
      publishedAt: true,
      articleStates: { where: { userId }, select: { read: true } },
    },
  });

  return rows.map(({ articleStates, ...row }) => ({ ...row, read: articleStates[0]?.read ?? false }));
}
