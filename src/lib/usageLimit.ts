import { prisma } from "@/lib/prisma";
import { type LimitResult, slidingWindow } from "@/lib/rateLimit";

// the longest window any limit uses is an hour — a day of history is plenty
const KEEP_MS = 24 * 60 * 60 * 1000;

// times of this key's events within the window
export async function recentUsage(key: string, windowMs: number, now = Date.now()): Promise<number[]> {
  const rows = await prisma.usageEvent.findMany({
    where: { key, createdAt: { gt: new Date(now - windowMs) } },
    select: { createdAt: true },
  });
  return rows.map((r) => r.createdAt.getTime());
}

export async function recordUsage(key: string, now = Date.now()): Promise<void> {
  await prisma.usageEvent.create({ data: { key, createdAt: new Date(now) } });
  await prisma.usageEvent.deleteMany({ where: { createdAt: { lt: new Date(now - KEEP_MS) } } });
}

export async function clearUsage(key: string): Promise<void> {
  await prisma.usageEvent.deleteMany({ where: { key } });
}

// at most `limit` uses per `windowMs`: takes one if there's room
export async function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): Promise<LimitResult> {
  const result = slidingWindow(await recentUsage(key, windowMs, now), now, limit, windowMs);
  if (result.ok) await recordUsage(key, now);
  return result;
}
