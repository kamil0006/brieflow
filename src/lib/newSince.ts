// "New" = first shown by the most recent refresh this browser ran. The
// server says from when (server time, so a skewed device clock can't break
// it) — this account's previous refresh, so news someone else fetched in the
// meantime counts too. Kept in localStorage; cards fetched at or after it get
// a "new" badge.
//
// The marker goes stale a while after the refresh — an article from a
// refresh two days ago that's still unread isn't "new" anymore.

const STORAGE_KEY = "newsSince";
const CHANGE_EVENT = "newsSince:change";
export const NEW_BADGE_TTL_MS = 12 * 60 * 60 * 1000;

export function setNewSince(isoTimestamp: string, refreshedAt: number = Date.now()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ since: isoTimestamp, at: refreshedAt }));
  } catch {
    // private mode / blocked storage — badges just won't show
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// the stored marker's `since`, or null once its refresh is older than the TTL
export function activeNewSince(raw: string | null, now: number): string | null {
  if (!raw) return null;
  let since: string = raw;
  let at = Date.parse(raw); // older format: just the timestamp
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { since?: unknown; at?: unknown };
      if (typeof parsed.since !== "string" || typeof parsed.at !== "number") return null;
      since = parsed.since;
      at = parsed.at;
    } catch {
      return null;
    }
  }
  if (Number.isNaN(at) || Number.isNaN(Date.parse(since)) || now - at > NEW_BADGE_TTL_MS) return null;
  return since;
}

export function readNewSince(): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // blocked storage — no badges
  }
  return activeNewSince(raw, Date.now());
}

export function subscribeNewSince(onChange: () => void) {
  // "storage" fires when another tab ran the refresh
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function isNewArticle(fetchedAt: Date, newSince: string | null): boolean {
  return newSince !== null && fetchedAt.getTime() >= Date.parse(newSince);
}
