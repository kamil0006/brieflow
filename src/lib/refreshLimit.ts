import { prisma } from "@/lib/prisma";
import { envNumber } from "@/lib/rateLimit";

// "Fetch new news" is the one thing that can run up the OpenAI bill without
// limit, so every account has two brakes, both read from the Refresh table:
// a short cooldown after a refresh that worked, and a cap per hour.
export const HOUR_MS = 60 * 60 * 1000;
const COOLDOWN_MS = envNumber("SCRAPE_COOLDOWN_MINUTES", 5) * 60 * 1000;
// 0 = no hourly cap
const PER_HOUR = envNumber("SCRAPE_LIMIT_PER_HOUR", 5);

export type RefreshRecord = { createdAt: Date; succeeded: boolean };
export type RefreshBlock = { reason: "cooldown" | "hourlyLimit"; waitMs: number };

// pure, so it can be tested without a database: `recent` is this account's
// refreshes from the last hour, in any order
export function refreshBlock(
  recent: RefreshRecord[],
  now: number,
  cooldownMs: number,
  perHour: number,
): RefreshBlock | null {
  const times = recent
    .map((r) => ({ at: r.createdAt.getTime(), succeeded: r.succeeded }))
    .filter((r) => now - r.at < HOUR_MS)
    .sort((a, b) => a.at - b.at);

  let block: RefreshBlock | null = null;

  if (perHour > 0 && times.length >= perHour) {
    // the oldest run that keeps the account at the cap has to leave the window
    const freesAt = times[times.length - perHour].at + HOUR_MS;
    block = { reason: "hourlyLimit", waitMs: freesAt - now };
  }

  const lastSucceeded = times.filter((r) => r.succeeded).at(-1);
  if (lastSucceeded) {
    const waitMs = cooldownMs - (now - lastSucceeded.at);
    if (waitMs > 0 && (!block || waitMs > block.waitMs)) block = { reason: "cooldown", waitMs };
  }

  return block;
}

export async function checkRefreshAllowed(userId: string, now = Date.now()): Promise<RefreshBlock | null> {
  const recent = await prisma.refresh.findMany({
    where: { userId, createdAt: { gt: new Date(now - HOUR_MS) } },
    select: { createdAt: true, succeeded: true },
  });
  return refreshBlock(recent, now, COOLDOWN_MS, PER_HOUR);
}

export async function recordRefresh(userId: string, succeeded: boolean): Promise<void> {
  await prisma.refresh.create({ data: { userId, succeeded } });
  // only the last hour is ever read — keep a day for looking into problems
  await prisma.refresh.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * HOUR_MS) } },
  });
}
