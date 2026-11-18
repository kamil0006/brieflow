// In-memory limits that keep OpenAI costs bounded. They live in the server
// process (kept on globalThis so dev hot reloads don't reset them), which is
// enough for a single-server app; a restart simply starts with a clean slate.

type LimiterStore = {
  hits: Map<string, number[]>;
  inFlight: Map<string, Promise<unknown>>;
  lastRun: Map<string, number>;
};

const globalForLimits = globalThis as unknown as { rateLimits: LimiterStore | undefined };

function store(): LimiterStore {
  globalForLimits.rateLimits ??= { hits: new Map(), inFlight: new Map(), lastRun: new Map() };
  return globalForLimits.rateLimits;
}

export type LimitResult = { ok: true } | { ok: false; retryAfterMs: number };

// sliding window: at most `limit` hits per `windowMs` for one key
export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const hits = store().hits;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]) };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
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

// how long `key` still has to wait; 0 means it may go ahead
export function cooldownLeft(key: string, cooldownMs: number, now = Date.now()): number {
  const last = store().lastRun.get(key);
  return last === undefined ? 0 : Math.max(0, cooldownMs - (now - last));
}

export function startCooldown(key: string, now = Date.now()) {
  store().lastRun.set(key, now);
}

export function resetRateLimits() {
  globalForLimits.rateLimits = undefined;
}

export function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
