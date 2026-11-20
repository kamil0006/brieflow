import type { Prisma } from "@/generated/prisma/client";
import { FEED_ORDER } from "@/lib/feed";
import { prisma } from "@/lib/prisma";

// The AI gives every article one priority, shared by all accounts. What one
// person keeps dismissing shouldn't sink it for everyone else, so each
// account's dismissals only lower priorities in that account's own feed:
// a category or source someone dismisses far more often than they open
// drops by 1, or by 2 when it's overwhelming. Computed when the feed is
// read — no AI calls, and it adapts as habits change.

const LOOKBACK_DAYS = 60;
const MAX_DROP = 2;

export type Demotions = {
  categories: Record<string, number>;
  sources: Record<string, number>;
};

export const NO_DEMOTIONS: Demotions = { categories: {}, sources: {} };

type Tally = { dismissed: number; opened: number };

// how much to lower a group the person reacted to this way
export function dropFor({ dismissed, opened }: Tally): number {
  if (dismissed >= 8 && dismissed >= 4 * Math.max(opened, 1)) return 2;
  if (dismissed >= 3 && dismissed >= 2 * Math.max(opened, 1)) return 1;
  return 0;
}

export function demotionsFrom(
  states: { dismissed: boolean; opened: boolean; category: string | null; sourceName: string }[],
): Demotions {
  const byCategory = new Map<string, Tally>();
  const bySource = new Map<string, Tally>();
  const bump = (map: Map<string, Tally>, key: string, s: { dismissed: boolean; opened: boolean }) => {
    const t = map.get(key) ?? { dismissed: 0, opened: 0 };
    if (s.dismissed) t.dismissed += 1;
    else if (s.opened) t.opened += 1;
    map.set(key, t);
  };
  for (const s of states) {
    if (s.category) bump(byCategory, s.category, s);
    bump(bySource, s.sourceName, s);
  }
  const toDrops = (map: Map<string, Tally>) =>
    Object.fromEntries([...map].map(([k, t]) => [k, dropFor(t)]).filter(([, d]) => (d as number) > 0));
  return { categories: toDrops(byCategory), sources: toDrops(bySource) };
}

export function hasDemotions(d: Demotions): boolean {
  return Object.keys(d.categories).length > 0 || Object.keys(d.sources).length > 0;
}

// the priority this person sees; unclassified (null) stays null
export function personalPriority(
  article: { priority: number | null; category: string | null; sourceName: string },
  d: Demotions,
): number | null {
  if (article.priority === null) return null;
  const drop = Math.min(
    MAX_DROP,
    (article.category ? (d.categories[article.category] ?? 0) : 0) + (d.sources[article.sourceName] ?? 0),
  );
  return Math.max(1, article.priority - drop);
}

export async function loadDemotions(userId: string, now: number = Date.now()): Promise<Demotions> {
  const since = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const states = await prisma.articleState.findMany({
    where: {
      userId,
      OR: [
        { dismissed: true, dismissedAt: { gte: since } },
        { read: true, readAt: { gte: since } },
      ],
    },
    select: {
      dismissed: true,
      readAt: true,
      article: { select: { category: true, sourceName: true } },
    },
  });
  return demotionsFrom(
    states.map((s) => ({
      dismissed: s.dismissed,
      opened: s.readAt !== null,
      category: s.article.category,
      sourceName: s.article.sourceName,
    })),
  );
}

type Rankable = { id: string; priority: number | null; category: string | null; sourceName: string; publishedAt: Date | null };

// same order as FEED_ORDER (priority desc, newest first; nulls last),
// but on the personal priority
export function sortByPersonalPriority<T extends Rankable>(rows: T[], d: Demotions): T[] {
  const time = (r: T) => r.publishedAt?.getTime() ?? -Infinity;
  return [...rows].sort((a, b) => {
    const pa = personalPriority(a, d) ?? -Infinity;
    const pb = personalPriority(b, d) ?? -Infinity;
    return pb - pa || time(b) - time(a);
  });
}

// ids of the top `take` feed articles in this person's order. Without
// demotions the database sorts as before; with them, only the few columns
// needed for ranking are loaded for the whole (week-long) feed.
export async function rankedFeedIds(
  where: Prisma.ArticleWhereInput,
  d: Demotions,
  take: number,
): Promise<string[]> {
  if (!hasDemotions(d)) {
    const rows = await prisma.article.findMany({ where, orderBy: FEED_ORDER, take, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.article.findMany({
    where,
    select: { id: true, priority: true, category: true, sourceName: true, publishedAt: true },
  });
  return sortByPersonalPriority(rows, d)
    .slice(0, take)
    .map((r) => r.id);
}

// how many feed articles reach `min` in this person's priority
export async function countAtPersonalPriority(
  where: Prisma.ArticleWhereInput,
  d: Demotions,
  min: number,
): Promise<number> {
  if (!hasDemotions(d)) return prisma.article.count({ where: { AND: [where, { priority: { gte: min } }] } });
  const rows = await prisma.article.findMany({
    where: { AND: [where, { priority: { gte: min } }] },
    select: { priority: true, category: true, sourceName: true },
  });
  return rows.filter((r) => (personalPriority(r, d) ?? 0) >= min).length;
}
