import type { Category } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { sourceHealth, toStatusUpdate } from "@/lib/sourceHealth";
import { allSources, type SourceFetchStatus } from "@/lib/sources/rss";

// stores the outcome of a refresh for every source that was fetched
export async function recordSourceStatuses(results: SourceFetchStatus[], now: Date = new Date()) {
  await prisma.$transaction(
    results.map((result) => {
      const update = toStatusUpdate(result, now);
      return prisma.sourceStatus.upsert({
        where: { sourceName: result.sourceName },
        create: {
          sourceName: result.sourceName,
          ...update,
          consecutiveFailures: result.ok ? 0 : 1,
        },
        update: result.ok ? update : { ...update, consecutiveFailures: { increment: 1 } },
      });
    }),
  );
}

// every known source with its current health, for Settings. Health is
// shared (one fetch for everyone), but whether a source is hidden is this
// account's own setting — someone else's choices don't show up here.
export async function loadSourceHealth(hiddenCategories: Category[], now: number = Date.now()) {
  const [statuses, lastNew] = await Promise.all([
    prisma.sourceStatus.findMany(),
    prisma.article.groupBy({ by: ["sourceName"], _max: { fetchedAt: true } }),
  ]);
  const statusBySource = new Map(statuses.map((s) => [s.sourceName, s]));
  const lastNewBySource = new Map(lastNew.map((row) => [row.sourceName, row._max.fetchedAt]));

  return allSources().map((source) => {
    const lastNewAt = lastNewBySource.get(source.sourceName) ?? null;
    return {
      ...source,
      lastNewAt,
      health: sourceHealth({
        status: statusBySource.get(source.sourceName) ?? null,
        lastNewArticleAt: lastNewAt,
        hidden: !!source.category && hiddenCategories.includes(source.category),
        now,
      }),
    };
  });
}
