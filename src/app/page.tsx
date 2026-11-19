import { redirect } from "next/navigation";
import { Fragment, Suspense } from "react";
import { ArticleRow } from "@/components/ArticleRow";
import { CategoryTabs } from "@/components/CategoryTabs";
import { CatchUpBanner } from "@/components/CatchUpBanner";
import { DailyBriefSection, DailyBriefSkeleton } from "@/components/DailyBrief";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { LoadMoreLink } from "@/components/LoadMoreLink";
import { MarkAllSeenButton } from "@/components/MarkAllSeenButton";
import { OnboardingTour } from "@/components/OnboardingTour";
import { SearchBar } from "@/components/SearchBar";
import { Sidebar } from "@/components/Sidebar";
import { SourceFilter } from "@/components/SourceFilter";
import { StatsPanel } from "@/components/StatsPanel";
import { VisitTracker } from "@/components/VisitTracker";
import { generateCatchUpBrief } from "@/lib/ai/catchupBrief";
import { getCurrentUserId } from "@/lib/auth/currentUser";
import { CATEGORIES, toCategory, type Category } from "@/lib/categories";
import { parseHiddenCategories, visibleCategoriesFilter } from "@/lib/categoryPrefs";
import { catchUpDateFilter, getCatchUpState, sinceLabel } from "@/lib/catchup";
import { pendingClassificationFilter } from "@/lib/classificationScope";
import { visibleContentFilter } from "@/lib/contentFilter";
import { FEED_ORDER, feedQuery, mainFeedWhere } from "@/lib/feed";
import { freshnessFilter, getStartOfToday } from "@/lib/freshness";
import { dictionaries } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/locale";
import { getTheme } from "@/lib/theme";
import { getNavCounts } from "@/lib/navCounts";
import { prisma } from "@/lib/prisma";
import { backfillSearchText } from "@/lib/searchBackfill";
import { searchFilter } from "@/lib/searchText";
import { buildHref, type ArticleFilters } from "@/lib/queryParams";
import type { ArticleListItem } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

// the list grows in steps of PAGE_SIZE via ?limit=, capped so a hand-edited
// URL can't ask the database for everything at once
const PAGE_SIZE = 50;
const MAX_LIMIT = 1000;

function parseLimit(value: string | string[] | undefined): number {
  const n = Number.parseInt((Array.isArray(value) ? value[0] : value) ?? "", 10);
  if (!Number.isFinite(n) || n <= PAGE_SIZE) return PAGE_SIZE;
  return Math.min(Math.ceil(n / PAGE_SIZE) * PAGE_SIZE, MAX_LIMIT);
}

function parseCategory(value: string | string[] | undefined): Category | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (CATEGORIES as string[]).includes(raw) ? (raw as Category) : null;
}

function ListSection({ heading, subtitle, spaced = false }: { heading: string; subtitle?: string; spaced?: boolean }) {
  return (
    <div className={spaced ? "pt-4" : ""}>
      <h2 className="text-sm font-medium text-text">{heading}</h2>
      {subtitle && <p className="text-xs text-text-faint mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hiddenCategories: true, onboardingCompletedAt: true },
  });
  const hiddenCategories = parseHiddenCategories(user?.hiddenCategories ?? "");
  const categoryVisibility = visibleCategoriesFilter(hiddenCategories);

  const params = await searchParams;
  const locale = await getLocale();
  const theme = await getTheme();
  const dict = dictionaries[locale];
  const category = parseCategory(params.category);
  const source = (Array.isArray(params.source) ? params.source[0] : params.source) ?? null;
  const savedOnly = params.saved === "1";
  const historyOnly = params.history === "1";
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const limit = parseLimit(params.limit);
  const isDefaultView = !savedOnly && !historyOnly;
  const isHomepage = isDefaultView && !category && !source && !query;

  // older articles predate the search column — fill it in before the first search
  if (query) await backfillSearchText();

  const catchUp = isHomepage
    ? await getCatchUpState(userId)
    : { isCatchUp: false, since: null, hoursAway: 0 };

  const filters: ArticleFilters = {
    category,
    source,
    saved: savedOnly,
    history: historyOnly,
    q: query,
  };

  const notDismissedByUser: Prisma.ArticleWhereInput = {
    NOT: { articleStates: { some: { userId, dismissed: true } } },
  };
  const startOfToday = getStartOfToday();
  const statsDateFilter = catchUp.isCatchUp && catchUp.since ? catchUpDateFilter(catchUp.since) : freshnessFilter();

  // "History" needs to be ordered by this user's readAt, which only exists
  // on ArticleState — Prisma can't order a to-many relation's filtered field
  // from the parent model, so it's queried from ArticleState as the root.
  // Either way, `rowsPromise` resolves to { article, read, saved }[] so the
  // mapping below doesn't need to care which path produced it.
  const rowsPromise = historyOnly
    ? prisma.articleState
        .findMany({
          where: {
            userId,
            read: true,
            // marked read in bulk ("mark all as read") has no readAt — those
            // were never opened, so they don't belong in History
            readAt: { not: null },
            dismissed: false,
            article: {
              AND: [
                {
                  ...(category ? { category } : {}),
                  ...(source ? { sourceName: source } : {}),
                  ...searchFilter(query),
                },
                visibleContentFilter(),
                categoryVisibility,
              ],
            },
          },
          orderBy: { readAt: "desc" },
          take: limit + 1,
          include: { article: true },
        })
        .then((states) => states.map((s) => ({ article: s.article, read: s.read, saved: s.saved })))
    : prisma.article
        .findMany({
          where: isDefaultView
            ? // shared with the reader's "next article" (src/lib/feed.ts).
              // In "catch-up" mode the window stretches to cover the whole
              // absence instead of a fixed 7 days.
              mainFeedWhere({
                userId,
                filters: { category, source, q: query },
                hiddenCategories,
                dateFilter: statsDateFilter,
              })
            : {
                // Saved shows exactly what you saved — read or not, duplicates included
                AND: [
                  {
                    ...(category ? { category } : {}),
                    ...(source ? { sourceName: source } : {}),
                    ...searchFilter(query),
                    articleStates: { some: { userId, saved: true } },
                  },
                  notDismissedByUser,
                  visibleContentFilter(),
                  categoryVisibility,
                ],
              },
          orderBy: FEED_ORDER,
          take: limit + 1,
          include: { articleStates: { where: { userId } } },
        })
        .then((rows) =>
          rows.map(({ articleStates, ...article }) => ({
            article,
            read: articleStates[0]?.read ?? false,
            saved: articleStates[0]?.saved ?? false,
          })),
        );

  // same definition the classifier uses, so the number means "will be
  // classified on the next refresh", not "every unclassified row ever"
  const pendingFilter = await pendingClassificationFilter();

  const [fetchedRows, counts, brief, newToday, mustRead, pendingClassification, sourceRows] = await Promise.all([
    rowsPromise,
    getNavCounts(userId, hiddenCategories, isHomepage ? statsDateFilter : undefined),
    // the regular daily brief streams in separately (see <Suspense> below)
    catchUp.isCatchUp && catchUp.since
      ? generateCatchUpBrief(userId, catchUp.since, locale, hiddenCategories)
      : Promise.resolve(null),
    prisma.article.count({
      where: {
        AND: [
          { fetchedAt: { gte: startOfToday } },
          notDismissedByUser,
          { duplicateOfId: null },
          visibleContentFilter(),
          categoryVisibility,
        ],
      },
    }),
    prisma.article.count({
      where: {
        AND: [
          { priority: 5, duplicateOfId: null },
          { NOT: { articleStates: { some: { userId, OR: [{ read: true }, { dismissed: true }] } } } },
          visibleContentFilter(),
          categoryVisibility,
          statsDateFilter,
        ],
      },
    }),
    prisma.article.count({ where: { AND: [pendingFilter, notDismissedByUser] } }),
    prisma.article.findMany({
      distinct: ["sourceName"],
      select: { sourceName: true },
      orderBy: { sourceName: "asc" },
    }),
  ]);

  const sources = sourceRows.map((row) => row.sourceName);
  const hasMore = fetchedRows.length > limit && limit < MAX_LIMIT;
  const rows = fetchedRows.slice(0, limit);

  const threadIds = [...new Set(rows.map((r) => r.article.threadId).filter((id) => id !== null))];
  const threadCounts =
    threadIds.length > 0
      ? await prisma.article.groupBy({
          by: ["threadId"],
          where: { threadId: { in: threadIds } },
          _count: { _all: true },
        })
      : [];
  const threadCountMap = new Map(
    threadCounts.map((t) => [t.threadId as string, t._count._all]),
  );

  const articles: ArticleListItem[] = rows.map(({ article, read, saved }) => ({
    id: article.id,
    url: article.url,
    title: article.title,
    summary: article.summary,
    sourceName: article.sourceName,
    category: toCategory(article.category),
    priority: article.priority,
    publishedAt: article.publishedAt,
    fetchedAt: article.fetchedAt,
    read,
    saved,
    consensusSources: article.consensusSources,
    qualityLabel: article.qualityLabel,
    qualityNote: article.qualityNote,
    threadId: article.threadId,
    threadCount: article.threadId ? (threadCountMap.get(article.threadId) ?? 1) : 1,
  }));

  // the feed is sorted by priority, so the must-reads (4-5) are the top of
  // the list itself — on the homepage they get a section heading instead of
  // being repeated in a separate box above the list
  const mustReadEnd = isHomepage
    ? (() => {
        const firstRest = articles.findIndex((a) => (a.priority ?? 0) < 4);
        return firstRest === -1 ? articles.length : firstRest;
      })()
    : 0;

  const loadMoreHref = (() => {
    const base = buildHref(filters, {});
    return `${base}${base.includes("?") ? "&" : "?"}limit=${limit + PAGE_SIZE}`;
  })();

  const activeNav = historyOnly ? "history" : savedOnly ? "saved" : "all";
  const emptyVariant = query
    ? "search"
    : historyOnly
      ? "history"
      : savedOnly
        ? "saved"
        : "all";

  return (
    <>
      <VisitTracker />
      <KeyboardShortcuts scope="list" locale={locale} />
      <Sidebar active={activeNav} counts={counts} locale={locale} theme={theme} />

      <div className="flex-1 min-w-0 flex flex-col lg:flex-row">
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6">
          <div className="mb-6">
            <h1 className="font-serif text-2xl text-text">
              {historyOnly ? dict.home.titleHistory : savedOnly ? dict.home.titleSaved : dict.home.title}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              {historyOnly ? dict.home.subtitleHistory : dict.home.subtitleDefault}
            </p>
          </div>

          {catchUp.isCatchUp ? (
            brief && (
              <CatchUpBanner content={brief} since={sinceLabel(catchUp.hoursAway, locale)} locale={locale} />
            )
          ) : (
            isHomepage && (
              // generated on first view for these settings (~2-3s) — the
              // list shouldn't wait for it
              <Suspense fallback={<DailyBriefSkeleton />}>
                <DailyBriefSection hiddenCategories={hiddenCategories} locale={locale} />
              </Suspense>
            )
          )}


          <SearchBar filters={filters} locale={locale} />

          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <CategoryTabs filters={filters} hiddenCategories={hiddenCategories} locale={locale} />
            <SourceFilter sources={sources} filters={filters} locale={locale} />
          </div>

          {articles.length === 0 ? (
            <EmptyState variant={emptyVariant} query={query} locale={locale} />
          ) : (
            <div className="space-y-3">
              {isDefaultView && (
                <div className="flex justify-end">
                  <MarkAllSeenButton ids={articles.map((a) => a.id)} locale={locale} />
                </div>
              )}
              {articles.map((article, i) => (
                <Fragment key={article.id}>
                  {i === 0 && mustReadEnd > 0 && (
                    <ListSection heading={dict.topPicks.heading} subtitle={dict.topPicks.subtitle(mustReadEnd)} />
                  )}
                  {i === mustReadEnd && mustReadEnd > 0 && (
                    <ListSection heading={dict.topPicks.rest} spaced />
                  )}
                  <ArticleRow
                    article={article}
                    locale={locale}
                    readerQuery={isDefaultView ? feedQuery({ category, source, q: query }) : ""}
                    tourTarget={isHomepage && i === 0}
                  />
                </Fragment>
              ))}
              {hasMore && (
                <LoadMoreLink
                  href={loadMoreHref}
                  label={dict.home.loadMore}
                  pendingLabel={dict.home.loadingMore}
                />
              )}
            </div>
          )}
        </main>

        <aside className="w-full lg:w-72 shrink-0 px-4 sm:px-6 lg:pr-6 pb-6 lg:py-6">
          <StatsPanel
            newToday={newToday}
            mustRead={mustRead}
            pendingClassification={pendingClassification}
            locale={locale}
          />
        </aside>
      </div>

      <OnboardingTour
        steps={dict.onboarding.steps}
        active={isHomepage && !user?.onboardingCompletedAt}
        labels={{
          next: dict.onboarding.next,
          back: dict.onboarding.back,
          skip: dict.onboarding.skip,
          done: dict.onboarding.done,
        }}
      />
    </>
  );
}
