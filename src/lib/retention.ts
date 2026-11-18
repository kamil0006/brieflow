import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { envNumber } from "@/lib/rateLimit";

// News goes stale: after the retention window an article is deleted, unless
// someone wants it kept — it's saved, or it was actually opened (History).
// Dismissals and bulk "mark as read" don't count as keeping: they're
// throwaway signals (the classifier only learns from recent dismissals).
//
// Measured on fetchedAt — when we got it — because publishedAt is missing
// for some sources. 30 days covers everything the app shows: the list is
// 7 days, the "catch-up" summary reaches back at most 30.

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = envNumber("ARTICLE_RETENTION_DAYS", 30);

export function retentionCutoff(now: number, days: number = RETENTION_DAYS): Date {
  return new Date(now - days * DAY_MS);
}

export function expiredArticlesWhere(cutoff: Date): Prisma.ArticleWhereInput {
  return {
    fetchedAt: { lt: cutoff },
    NOT: {
      articleStates: {
        some: { OR: [{ saved: true }, { read: true, readAt: { not: null } }] },
      },
    },
  };
}

export async function pruneExpiredNews(now: number = Date.now()) {
  const cutoff = retentionCutoff(now);
  // ArticleState rows go with their article (ON DELETE CASCADE); newer
  // duplicates of a deleted article simply become standalone (SET NULL)
  const articles = await prisma.article.deleteMany({ where: expiredArticlesWhere(cutoff) });
  // daily briefs are keyed by "YYYY-MM-DD|…" dates
  const briefs = await prisma.dailyBrief.deleteMany({
    where: { date: { lt: cutoff.toISOString().slice(0, 10) } },
  });
  return { articles: articles.count, briefs: briefs.count };
}
