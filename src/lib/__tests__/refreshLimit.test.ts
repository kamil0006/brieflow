import { describe, expect, it } from "vitest";
import { HOUR_MS, refreshBlock } from "@/lib/refreshLimit";

const MIN = 60 * 1000;
const NOW = Date.parse("2026-11-19T12:00:00Z");
const run = (minutesAgo: number, succeeded = true) => ({
  createdAt: new Date(NOW - minutesAgo * MIN),
  succeeded,
});

describe("refreshBlock", () => {
  it("lets a fresh account refresh", () => {
    expect(refreshBlock([], NOW, 5 * MIN, 5)).toBeNull();
  });

  it("waits out the cooldown after a refresh that worked", () => {
    expect(refreshBlock([run(2)], NOW, 5 * MIN, 5)).toEqual({ reason: "cooldown", waitMs: 3 * MIN });
    expect(refreshBlock([run(6)], NOW, 5 * MIN, 5)).toBeNull();
  });

  it("doesn't make anyone wait after a failed run", () => {
    expect(refreshBlock([run(1, false)], NOW, 5 * MIN, 5)).toBeNull();
  });

  it("caps refreshes per hour, failed ones included", () => {
    const five = [run(50), run(40, false), run(30), run(20), run(10)];
    expect(refreshBlock(five, NOW, 5 * MIN, 5)).toEqual({ reason: "hourlyLimit", waitMs: 10 * MIN });
    expect(refreshBlock(five.slice(1), NOW, 5 * MIN, 5)).toBeNull();
  });

  it("forgets runs older than an hour", () => {
    const old = Array.from({ length: 10 }, (_, i) => run(61 + i));
    expect(refreshBlock(old, NOW, 5 * MIN, 5)).toBeNull();
  });

  it("reports whichever wait is longer", () => {
    const five = [run(59), run(4), run(3), run(2), run(1)];
    // the cap frees up in 1 min, but the last refresh was 1 min ago
    expect(refreshBlock(five, NOW, 5 * MIN, 5)).toEqual({ reason: "cooldown", waitMs: 4 * MIN });
  });

  it("has no hourly cap when it's set to 0", () => {
    const many = Array.from({ length: 20 }, (_, i) => run(10 + i, false));
    expect(refreshBlock(many, NOW, 5 * MIN, 0)).toBeNull();
    expect(HOUR_MS).toBe(60 * MIN);
  });
});
