import { prisma } from "@/lib/prisma";
import { searchTextFor } from "@/lib/searchText";

// Articles saved before the searchText column existed get it filled in on
// first use; after that this is a single query that finds nothing.
const BACKFILL_BATCH = 500;

export async function backfillSearchText(): Promise<number> {
  let filled = 0;
  for (;;) {
    const rows = await prisma.article.findMany({
      where: { searchText: null },
      select: { id: true, title: true, summary: true },
      take: BACKFILL_BATCH,
    });
    if (rows.length === 0) return filled;
    await prisma.$transaction(
      rows.map((row) =>
        prisma.article.update({
          where: { id: row.id },
          data: { searchText: searchTextFor(row.title, row.summary) },
        }),
      ),
    );
    filled += rows.length;
  }
}
