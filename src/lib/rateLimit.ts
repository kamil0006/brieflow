// Shared helpers for the limits that keep OpenAI costs bounded. The limits
// themselves are stored in the database (src/lib/usageLimit.ts); only the
// "one refresh at a time" lock lives in server memory (kept on globalThis so
// dev hot reloads don't reset it).

type LimiterStore = {
  inFlight: Map<string, Promise<unknown>>;
};

const globalForLimits = globalThis as unknown as { rateLimits: LimiterStore | undefined };

function store(): LimiterStore {
  globalForLimits.rateLimits ??= { inFlight: new Map() };
  return globalForLimits.rateLimits;
}

export type LimitResult = { ok: true } | { ok: false; retryAfterMs: number };

// sliding window: is there room for one more hit, given the earlier hits'
// times? At most `limit` per `windowMs`.
export function slidingWindow(hits: number[], now: number, limit: number, windowMs: number): LimitResult {
  const recent = hits.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (recent.length < limit) return { ok: true };
  // the oldest hit that keeps the window full has to leave it
  return { ok: false, retryAfterMs: recent[recent.length - limit] + windowMs - now };
}

// while a run with this name is in progress, later callers get the same
// promise instead of starting (and paying for) a second one
export function shareInFlight<T>(name: string, task: () => Promise<T>): Promise<T> {
  const { inFlight } = store();
  const running = inFlight.get(name);
  if (running) return running as Promise<T>;

  const promise = task().finally(() => inFlight.delete(name));
  inFlight.set(name, promise);
  return promise;
}

export function resetRateLimits() {
  globalForLimits.rateLimits = undefined;
}

export function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
