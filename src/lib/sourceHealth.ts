import type { SourceFetchStatus } from "@/lib/sources/rss";

// How each news source is doing, for the list in Settings. A feed can break
// quietly — it moves, starts blocking bots, or keeps answering with the same
// old items — and the refresh just carries on with the other sources.

// a working feed with nothing new for this long probably stopped updating
export const STALE_AFTER_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StoredSourceStatus = {
  lastAttemptAt: Date;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastItemCount: number;
  consecutiveFailures: number;
};

export type SourceHealth =
  | { state: "ok" }
  | { state: "error"; error: string; failures: number; lastSuccessAt: Date | null }
  | { state: "empty" }
  | { state: "stale"; lastNewAt: Date }
  | { state: "hidden" }
  | { state: "unknown" };

export function sourceHealth({
  status,
  lastNewArticleAt,
  hidden,
  now,
}: {
  status: StoredSourceStatus | null;
  // newest article we saved from this source
  lastNewArticleAt: Date | null;
  // this account turned the source's only category off
  hidden: boolean;
  now: number;
}): SourceHealth {
  if (hidden) return { state: "hidden" };
  if (!status) return { state: "unknown" };
  if (status.consecutiveFailures > 0) {
    return {
      state: "error",
      error: status.lastError ?? "",
      failures: status.consecutiveFailures,
      lastSuccessAt: status.lastSuccessAt,
    };
  }
  if (status.lastItemCount === 0) return { state: "empty" };
  if (lastNewArticleAt && now - lastNewArticleAt.getTime() > STALE_AFTER_DAYS * DAY_MS) {
    return { state: "stale", lastNewAt: lastNewArticleAt };
  }
  return { state: "ok" };
}

export function toStatusUpdate(result: SourceFetchStatus, now: Date) {
  return result.ok
    ? {
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastError: null,
        lastItemCount: result.itemCount,
        consecutiveFailures: 0,
      }
    : { lastAttemptAt: now, lastError: result.error, lastItemCount: 0 };
}
