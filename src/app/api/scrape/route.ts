import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDailyBrief, invalidateDailyBriefs } from "@/lib/ai/brief";
import { classifyPendingArticles } from "@/lib/ai/classify";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { parseHiddenCategories, visibleCategoriesFilter } from "@/lib/categoryPrefs";
import { mutedKeywordsFilter, parseMutedKeywords } from "@/lib/mutedKeywords";
import { getCategoriesHiddenByEveryone } from "@/lib/classificationScope";
import { visibleContentFilter } from "@/lib/contentFilter";
import { prisma } from "@/lib/prisma";
import { markDuplicates } from "@/lib/dedupe";
import { dictionaries } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/locale";
import { fetchHackerNewsTopStories } from "@/lib/sources/hackernews";
import { errorMessage, fetchRssFeeds, type SourceFetchStatus } from "@/lib/sources/rss";
import { HACKER_NEWS_SOURCE } from "@/lib/sources/types";
import { recordSourceStatuses } from "@/lib/sourceStatus";
import { shareInFlight } from "@/lib/rateLimit";
import { checkRefreshAllowed, recordRefresh } from "@/lib/refreshLimit";
import { pruneExpiredNews } from "@/lib/retention";
import { saveArticles } from "@/lib/scrape";
import { linkThreads } from "@/lib/threads";

// a failed step doesn't stop the refresh — it's reported and the rest carries on
function stepFailed(errors: string[], label: string, error: unknown) {
  errors.push(`${label}: ${errorMessage(error)}`);
}

export async function POST(req: NextRequest) {
  const cookieLocale = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const t = dictionaries[locale].refreshErrors;

  const userId = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // a short cooldown after each refresh that worked, and a cap per hour —
  // see src/lib/refreshLimit.ts
  const block = await checkRefreshAllowed(userId);
  if (block) {
    return NextResponse.json(
      { status: block.reason, retryAfterSec: Math.ceil(block.waitMs / 1000) },
      { status: 429 },
    );
  }

  // articles are shared, so if the other person is mid-refresh we simply
  // wait for that run instead of paying OpenAI twice for the same news. The
  // run keeps going on the server even if the tab that started it closes.
  const { succeeded, ...result } = await shareInFlight("scrape", () => scrapeAndClassify(locale));
  // every run counts towards the hourly cap; only one that worked starts
  // the cooldown, so a failed one never leaves anyone waiting for nothing
  await recordRefresh(userId, succeeded);

  // briefs are per settings: the run dropped today's (each regenerates on
  // its next view), and the person who clicked gets theirs right away
  let brief = false;
  // badge marker: news this account sees for the first time — from this
  // run, and from anyone else's since this account last refreshed
  let newSince: string | null = null;
  let newCount = 0;
  let importantCount = 0;
  const errors = [...result.errors];
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hiddenCategories: true, mutedKeywords: true, feedCutoff: true },
    });
    if (user) {
      // only this person's feed moves forward — everything fetched since
      // their own last refresh (by this run, or by someone else's in the
      // meantime) shows up for them now
      const previousCutoff = user.feedCutoff;
      const feedCutoff = new Date();
      await prisma.user.update({ where: { id: userId }, data: { feedCutoff } });
      // the previous cutoff itself was already visible (fetchedAt <= cutoff)
      newSince = new Date(previousCutoff.getTime() + 1).toISOString();

      const hiddenCategories = parseHiddenCategories(user.hiddenCategories);
      const mutedKeywords = parseMutedKeywords(user.mutedKeywords);
      // what this person will actually see from the run — their hidden
      // categories, duplicates and filtered-out promo don't count as "new"
      const newWhere = {
        AND: [
          { fetchedAt: { gt: previousCutoff, lte: feedCutoff }, duplicateOfId: null },
          visibleContentFilter(),
          visibleCategoriesFilter(hiddenCategories),
          mutedKeywordsFilter(mutedKeywords),
        ],
      };
      [newCount, importantCount] = await Promise.all([
        prisma.article.count({ where: newWhere }),
        prisma.article.count({ where: { AND: [newWhere, { priority: { gte: 4 } }] } }),
      ]);
      brief = (await getOrCreateDailyBrief(hiddenCategories, mutedKeywords, locale, feedCutoff)) !== null;
    }
  } catch (error) {
    stepFailed(errors, t.brief, error);
  }

  return NextResponse.json({ ...result, newSince, brief, newCount, importantCount, errors });
}

async function scrapeAndClassify(locale: Locale) {
  const t = dictionaries[locale].refreshErrors;
  const errors: string[] = [];
  // everything saved from here on counts as "new" from this run
  const startedAt = new Date().toISOString();

  // single-topic feeds for categories every account hides aren't fetched
  const unwantedCategories = await getCategoriesHiddenByEveryone();

  const [hnResult, rssResult] = await Promise.allSettled([
    fetchHackerNewsTopStories(30),
    fetchRssFeeds(unwantedCategories),
  ]);

  const articles = [
    ...(hnResult.status === "fulfilled" ? hnResult.value : []),
    ...(rssResult.status === "fulfilled" ? rssResult.value.articles : []),
  ];

  const statuses: SourceFetchStatus[] = [
    hnResult.status === "fulfilled"
      ? { sourceName: HACKER_NEWS_SOURCE, ok: true, itemCount: hnResult.value.length, error: null }
      : { sourceName: HACKER_NEWS_SOURCE, ok: false, itemCount: 0, error: errorMessage(hnResult.reason) },
  ];
  if (hnResult.status === "rejected") {
    errors.push(`Hacker News: ${errorMessage(hnResult.reason)}`);
  }
  if (rssResult.status === "fulfilled") {
    errors.push(...rssResult.value.errors);
    statuses.push(...rssResult.value.statuses);
  } else {
    errors.push(`RSS: ${errorMessage(rssResult.reason)}`);
  }

  // per-source health for Settings — a bookkeeping failure must not fail the refresh
  try {
    await recordSourceStatuses(statuses);
  } catch (error) {
    stepFailed(errors, t.sourceStatus, error);
  }

  const saved = await saveArticles(articles);

  // old news nobody kept goes away (see src/lib/retention.ts)
  let pruned = 0;
  try {
    pruned = (await pruneExpiredNews()).articles;
  } catch (error) {
    stepFailed(errors, t.cleanup, error);
  }

  // classification must run before duplicate detection — we compare
  // AI summaries, which don't exist yet for freshly saved articles
  let classified = 0;
  let deepened = 0;
  let skippedStale = 0;
  let retried = 0;
  let tokensUsed = { promptTokens: 0, completionTokens: 0 };
  let classifyFailed = false;
  try {
    const result = await classifyPendingArticles(locale);
    classified = result.classified;
    deepened = result.deepened;
    skippedStale = result.skippedStale;
    retried = result.retried;
    tokensUsed = result.tokensUsed;
  } catch (error) {
    stepFailed(errors, t.classification, error);
    classifyFailed = true;
  }

  let duplicates = 0;
  let boosted = 0;
  try {
    const result = await markDuplicates();
    duplicates = result.marked;
    boosted = result.boosted;
  } catch (error) {
    stepFailed(errors, t.duplicates, error);
  }

  let threaded = 0;
  try {
    const result = await linkThreads();
    threaded = result.linked;
  } catch (error) {
    stepFailed(errors, t.threads, error);
  }

  try {
    await invalidateDailyBriefs();
  } catch (error) {
    stepFailed(errors, t.brief, error);
  }

  return {
    ...saved,
    classified,
    deepened,
    skippedStale,
    retried,
    skippedCategories: unwantedCategories,
    tokensUsed,
    duplicates,
    boosted,
    threaded,
    pruned,
    errors,
    startedAt,
    // nothing fetched or the AI step broke — don't make anyone wait to retry
    succeeded: articles.length > 0 && !classifyFailed,
  };
}
