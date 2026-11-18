import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDailyBrief, invalidateDailyBriefs } from "@/lib/ai/brief";
import { classifyPendingArticles } from "@/lib/ai/classify";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { parseHiddenCategories } from "@/lib/categoryPrefs";
import { getCategoriesHiddenByEveryone } from "@/lib/classificationScope";
import { prisma } from "@/lib/prisma";
import { markDuplicates } from "@/lib/dedupe";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/locale";
import { fetchHackerNewsTopStories } from "@/lib/sources/hackernews";
import { fetchRssFeeds } from "@/lib/sources/rss";
import { cooldownLeft, envNumber, shareInFlight, startCooldown } from "@/lib/rateLimit";
import { saveArticles } from "@/lib/scrape";
import { linkThreads } from "@/lib/threads";

// each account has its own cooldown; it only starts after a refresh that
// actually worked, so a failed one (or one whose tab was closed) never
// leaves anyone waiting for nothing
const COOLDOWN_MS = envNumber("SCRAPE_COOLDOWN_MINUTES", 5) * 60 * 1000;

export async function POST(req: NextRequest) {
  const cookieLocale = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  const userId = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cooldownKey = `scrape:${userId}`;
  const waitMs = cooldownLeft(cooldownKey, COOLDOWN_MS);
  if (waitMs > 0) {
    return NextResponse.json(
      { status: "cooldown", retryAfterSec: Math.ceil(waitMs / 1000) },
      { status: 429 },
    );
  }

  // articles are shared, so if the other person is mid-refresh we simply
  // wait for that run instead of paying OpenAI twice for the same news. The
  // run keeps going on the server even if the tab that started it closes.
  const { succeeded, ...result } = await shareInFlight("scrape", () => scrapeAndClassify(locale));
  if (succeeded) startCooldown(cooldownKey);

  // briefs are per settings: the run dropped today's (each regenerates on
  // its next view), and the person who clicked gets theirs right away
  let brief = false;
  const errors = [...result.errors];
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { hiddenCategories: true } });
    if (user) {
      brief = (await getOrCreateDailyBrief(parseHiddenCategories(user.hiddenCategories), locale)) !== null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd";
    errors.push(`Przegląd dnia: ${message}`);
  }

  return NextResponse.json({ ...result, brief, errors });
}

async function scrapeAndClassify(locale: Locale) {
  const errors: string[] = [];

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

  if (hnResult.status === "rejected") {
    errors.push(`Hacker News: ${hnResult.reason}`);
  }
  if (rssResult.status === "fulfilled") {
    errors.push(...rssResult.value.errors);
  } else {
    errors.push(`RSS: ${rssResult.reason}`);
  }

  const saved = await saveArticles(articles);

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
    const message = error instanceof Error ? error.message : "Nieznany błąd";
    errors.push(`Klasyfikacja AI: ${message}`);
    classifyFailed = true;
  }

  let duplicates = 0;
  let boosted = 0;
  try {
    const result = await markDuplicates();
    duplicates = result.marked;
    boosted = result.boosted;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd";
    errors.push(`Wykrywanie duplikatów: ${message}`);
  }

  let threaded = 0;
  try {
    const result = await linkThreads();
    threaded = result.linked;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd";
    errors.push(`Wątki tematyczne: ${message}`);
  }

  try {
    await invalidateDailyBriefs();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd";
    errors.push(`Przegląd dnia: ${message}`);
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
    errors,
    // nothing fetched or the AI step broke — don't make anyone wait to retry
    succeeded: articles.length > 0 && !classifyFailed,
  };
}
