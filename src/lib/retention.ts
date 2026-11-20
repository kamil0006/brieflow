import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { envNumber } from "@/lib/rateLimit";
import { isPaywalledUrl } from "@/lib/sources/paywall";
import { allSources } from "@/lib/sources/rss";

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

// saved or actually opened — someone wants to keep it
const KEPT: Prisma.ArticleWhereInput = {
  articleStates: {
    some: { OR: [{ saved: true }, { read: true, readAt: { not: null } }] },
  },
};

export function expiredArticlesWhere(cutoff: Date): Prisma.ArticleWhereInput {
  return { fetchedAt: { lt: cutoff }, NOT: KEPT };
}

// Articles nobody can read for free: from feeds that were dropped for being
// paywalled, or aggregator links to paywalled sites saved before the filter
// existed. Removed right away instead of waiting for the retention window;
// saved/opened ones stay, like with expiry.
async function prunePaywalled(): Promise<number> {
  const current = allSources().map((s) => s.sourceName);
  const candidates = await prisma.article.findMany({
    where: { NOT: KEPT },
    select: { id: true, url: true, sourceName: true },
  });
  const ids = candidates
    .filter((a) => !current.includes(a.sourceName) || isPaywalledUrl(a.url))
    .map((a) => a.id);
  if (ids.length === 0) return 0;
  const { count } = await prisma.article.deleteMany({ where: { id: { in: ids } } });
  return count;
}

export async function pruneExpiredNews(now: number = Date.now()) {
  const cutoff = retentionCutoff(now);
  // ArticleState rows go with their article (ON DELETE CASCADE); newer
  // duplicates of a deleted article simply become standalone (SET NULL)
  const expired = await prisma.article.deleteMany({ where: expiredArticlesWhere(cutoff) });
  const paywalled = await prunePaywalled();
  // daily briefs are keyed by "YYYY-MM-DD|…" dates
  const briefs = await prisma.dailyBrief.deleteMany({
    where: { date: { lt: cutoff.toISOString().slice(0, 10) } },
  });
  return { articles: expired.count + paywalled, briefs: briefs.count };
}
