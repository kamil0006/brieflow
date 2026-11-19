import type { Category } from "@/lib/categories";
import { visibleCategoriesFilter } from "@/lib/categoryPrefs";
import { visibleContentFilter } from "@/lib/contentFilter";
import { fetchedByCutoff } from "@/lib/feedCutoff";
import { freshnessFilter } from "@/lib/freshness";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function getNavCounts(
  userId: string,
  hiddenCategories: Category[],
  feedCutoff: Date,
  allDateFilter?: Prisma.ArticleWhereInput,
) {
  const categoryVisibility = visibleCategoriesFilter(hiddenCategories);

  const [all, saved, history] = await Promise.all([
    prisma.article.count({
      where: {
        AND: [
          {
            duplicateOfId: null,
            NOT: { articleStates: { some: { userId, OR: [{ dismissed: true }, { read: true }] } } },
          },
          visibleContentFilter(),
          categoryVisibility,
          fetchedByCutoff(feedCutoff),
          allDateFilter ?? freshnessFilter(),
        ],
      },
    }),
    prisma.article.count({
      where: {
        AND: [
          { articleStates: { some: { userId, saved: true } } },
          { NOT: { articleStates: { some: { userId, dismissed: true } } } },
          visibleContentFilter(),
          categoryVisibility,
        ],
      },
    }),
    prisma.articleState.count({
      where: {
        userId,
        read: true,
        readAt: { not: null }, // opened, not just marked read in bulk
        dismissed: false,
        article: { AND: [visibleContentFilter(), categoryVisibility] },
      },
    }),
  ]);

  return { all, saved, history };
}
