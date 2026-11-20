import Parser from "rss-parser";
import type { Category } from "@/lib/categories";
import { HACKER_NEWS_SOURCE, type NormalizedArticle } from "@/lib/sources/types";

// Only sources readers can open without a subscription. Paywalled feeds
// (MarketWatch, Wired, MIT Technology Review, The Hollywood Reporter) were
// dropped; links from aggregators are filtered in paywall.ts.
//
// `category` marks feeds that cover a single topic. If every user hides that
// category, the feed isn't fetched at all. Mixed feeds (no category) always are.
// `maxItems` caps high-volume feeds so one source doesn't drown its category.
type FeedConfig = { url: string; sourceName: string; category?: Category; maxItems?: number };

const FEEDS: FeedConfig[] = [
  { url: "https://feeds.arstechnica.com/arstechnica/index", sourceName: "Ars Technica" },
  { url: "https://techcrunch.com/feed/", sourceName: "TechCrunch" },
  { url: "https://www.engadget.com/rss.xml", sourceName: "Engadget" },
  { url: "https://www.pcgamer.com/rss/", sourceName: "PC Gamer", category: "Gaming" },
  { url: "https://www.rockpapershotgun.com/feed", sourceName: "Rock Paper Shotgun", category: "Gaming" },
  { url: "https://feeds.ign.com/ign/games-all", sourceName: "IGN", category: "Gaming" },
  { url: "https://www.gamesindustry.biz/feed", sourceName: "GamesIndustry.biz", category: "Gaming" },
  { url: "https://lobste.rs/rss", sourceName: "Lobsters" },
  { url: "https://dev.to/feed/tag/ai", sourceName: "Dev.to" },
  { url: "https://www.eurogamer.net/feed", sourceName: "Eurogamer", category: "Gaming" },
  { url: "https://www.polygon.com/rss/index.xml", sourceName: "Polygon", category: "Gaming" },
  { url: "https://kotaku.com/rss", sourceName: "Kotaku", category: "Gaming" },

  // business/startups/finance
  { url: "https://techcrunch.com/category/startups/feed/", sourceName: "TechCrunch Startups", category: "Business" },
  { url: "https://www.cnbc.com/id/10001147/device/rss/rss.html", sourceName: "CNBC", category: "Business" },
  { url: "https://www.theguardian.com/uk/business/rss", sourceName: "The Guardian Business", category: "Business" },

  // science — broad (physics, biology, medicine, maths, environment) first,
  // space capped so it doesn't dominate the category
  { url: "https://www.sciencedaily.com/rss/top/science.xml", sourceName: "ScienceDaily", category: "Science" },
  { url: "https://www.quantamagazine.org/feed/", sourceName: "Quanta Magazine", category: "Science" },
  { url: "https://www.theguardian.com/science/rss", sourceName: "The Guardian Science", category: "Science" },
  { url: "https://newatlas.com/science/index.rss", sourceName: "New Atlas", category: "Science" },
  { url: "https://www.nasa.gov/feed/", sourceName: "NASA", category: "Science", maxItems: 5 },
  { url: "https://www.space.com/feeds/all", sourceName: "Space.com", category: "Science", maxItems: 5 },

  // entertainment/movies/TV
  { url: "https://variety.com/feed/", sourceName: "Variety", category: "Entertainment" },
  { url: "https://collider.com/feed/", sourceName: "Collider", category: "Entertainment" },
];

const MAX_ITEMS_PER_FEED = 15;

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; Brieflow/0.1; personal news reader)",
  },
});

async function fetchFeed(feed: FeedConfig): Promise<NormalizedArticle[]> {
  const parsed = await parser.parseURL(feed.url);

  return (parsed.items ?? [])
    .slice(0, feed.maxItems ?? MAX_ITEMS_PER_FEED)
    .filter((item) => item.link && item.title)
    .map((item) => ({
      sourceType: "rss",
      sourceName: feed.sourceName,
      externalId: item.guid ?? item.link!,
      url: item.link!,
      title: item.title!,
      content: (item.contentSnippet ?? item.content ?? null)?.slice(0, 2000) ?? null,
      score: null,
      commentsCount: null,
      publishedAt: item.isoDate
        ? new Date(item.isoDate)
        : item.pubDate
          ? new Date(item.pubDate)
          : null,
    }));
}

function activeFeeds(skipCategories: readonly Category[]): FeedConfig[] {
  return FEEDS.filter((feed) => !feed.category || !skipCategories.includes(feed.category));
}

// names of single-topic sources for the given categories — used to keep
// already-saved articles from those feeds out of the classification queue
export function sourceNamesForCategories(categories: readonly Category[]): string[] {
  return FEEDS.filter((feed) => feed.category && categories.includes(feed.category)).map(
    (feed) => feed.sourceName,
  );
}

// every source the app knows, for the source health list in Settings
export function allSources(): { sourceName: string; category?: Category }[] {
  return [{ sourceName: HACKER_NEWS_SOURCE }, ...FEEDS.map(({ sourceName, category }) => ({ sourceName, category }))];
}

export function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.slice(0, 300);
}

export type SourceFetchStatus = { sourceName: string; ok: boolean; itemCount: number; error: string | null };

export async function fetchRssFeeds(skipCategories: readonly Category[] = []): Promise<{
  articles: NormalizedArticle[];
  errors: string[];
  statuses: SourceFetchStatus[];
}> {
  const feeds = activeFeeds(skipCategories);
  const results = await Promise.allSettled(feeds.map(fetchFeed));

  const articles: NormalizedArticle[] = [];
  const errors: string[] = [];
  const statuses: SourceFetchStatus[] = [];

  results.forEach((result, i) => {
    const { sourceName } = feeds[i];
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      statuses.push({ sourceName, ok: true, itemCount: result.value.length, error: null });
    } else {
      const error = errorMessage(result.reason);
      errors.push(`${sourceName}: ${error}`);
      statuses.push({ sourceName, ok: false, itemCount: 0, error });
    }
  });

  return { articles, errors, statuses };
}
