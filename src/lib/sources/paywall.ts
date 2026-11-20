// Sites that put most articles behind a subscription (hard or metered
// paywall). Aggregators like Hacker News and Lobsters link anywhere, so
// their links to these sites are dropped before they reach the database —
// the app only shows news anyone can read. Subdomains count too
// (e.g. "www.nytimes.com", "cooking.nytimes.com").
export const PAYWALLED_DOMAINS = [
  "nytimes.com",
  "wsj.com",
  "ft.com",
  "bloomberg.com",
  "economist.com",
  "washingtonpost.com",
  "theatlantic.com",
  "newyorker.com",
  "wired.com",
  "technologyreview.com",
  "marketwatch.com",
  "barrons.com",
  "businessinsider.com",
  "theinformation.com",
  "hollywoodreporter.com",
  "deadline.com",
  "theverge.com",
  "telegraph.co.uk",
  "thetimes.co.uk",
  "thetimes.com",
  "medium.com",
  "hbr.org",
  "newscientist.com",
  "scientificamerican.com",
  "livescience.com",
  "historyextra.com",
  "nature.com",
  "science.org",
  "latimes.com",
  "bostonglobe.com",
  "seekingalpha.com",
  "fortune.com",
  "forbes.com",
  "foreignpolicy.com",
  "foreignaffairs.com",
  "nymag.com",
  "vanityfair.com",
  "spectator.co.uk",
  "haaretz.com",
  "asia.nikkei.com",
  "stratechery.com",
];

export function isPaywalledUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PAYWALLED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
