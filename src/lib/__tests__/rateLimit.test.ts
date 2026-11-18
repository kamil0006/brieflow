import { beforeEach, describe, expect, it } from "vitest";
import { cooldownLeft, resetRateLimits, shareInFlight, startCooldown, takeToken } from "@/lib/rateLimit";

beforeEach(() => resetRateLimits());

describe("takeToken", () => {
  it("allows up to the limit within the window, then blocks", () => {
    expect(takeToken("k", 2, 1000, 0).ok).toBe(true);
    expect(takeToken("k", 2, 1000, 100).ok).toBe(true);
    const blocked = takeToken("k", 2, 1000, 200);
    expect(blocked).toEqual({ ok: false, retryAfterMs: 800 });
  });

  it("frees a slot once the oldest hit leaves the window", () => {
    takeToken("k", 1, 1000, 0);
    expect(takeToken("k", 1, 1000, 999).ok).toBe(false);
    expect(takeToken("k", 1, 1000, 1000).ok).toBe(true);
  });

  it("counts keys separately", () => {
    takeToken("a", 1, 1000, 0);
    expect(takeToken("b", 1, 1000, 0).ok).toBe(true);
  });
});

describe("shareInFlight", () => {
  it("gives a second caller the run already in progress", async () => {
    let calls = 0;
    let release!: () => void;
    const task = () => {
      calls += 1;
      return new Promise<string>((r) => (release = () => r("done")));
    };
    const first = shareInFlight("job", task);
    const second = shareInFlight("job", task);
    release();
    expect(await first).toBe("done");
    expect(await second).toBe("done");
    expect(calls).toBe(1);
  });

  it("starts a fresh run once the previous one has finished", async () => {
    await shareInFlight("job", async () => 1);
    expect(await shareInFlight("job", async () => 2)).toBe(2);
  });

  it("lets the next run start after a failure", async () => {
    await expect(shareInFlight("job", async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await shareInFlight("job", async () => 1)).toBe(1);
  });
});

describe("cooldown", () => {
  it("is free until started, then counts down per key", () => {
    expect(cooldownLeft("a", 1000, 0)).toBe(0);
    startCooldown("a", 0);
    expect(cooldownLeft("a", 1000, 400)).toBe(600);
    expect(cooldownLeft("b", 1000, 400)).toBe(0);
    expect(cooldownLeft("a", 1000, 1000)).toBe(0);
  });
});
