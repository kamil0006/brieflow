// "New" = fetched by the most recent refresh this browser ran. The start of
// that run (server time, so a skewed device clock can't break it) is kept in
// localStorage; cards fetched at or after it get a "new" badge.
//
// The marker goes stale after a while — an article from a refresh two days
// ago that's still unread isn't "new" anymore.

const STORAGE_KEY = "newsSince";
const CHANGE_EVENT = "newsSince:change";
export const NEW_BADGE_TTL_MS = 12 * 60 * 60 * 1000;

export function setNewSince(isoTimestamp: string) {
  try {
    localStorage.setItem(STORAGE_KEY, isoTimestamp);
  } catch {
    // private mode / blocked storage — badges just won't show
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// the stored marker, or null once it's older than the TTL
export function activeNewSince(raw: string | null, now: number): string | null {
  if (!raw) return null;
  const since = Date.parse(raw);
  if (Number.isNaN(since) || now - since > NEW_BADGE_TTL_MS) return null;
  return raw;
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
