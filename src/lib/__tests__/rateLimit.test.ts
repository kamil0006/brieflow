import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits, shareInFlight, slidingWindow } from "@/lib/rateLimit";

beforeEach(() => resetRateLimits());

describe("slidingWindow", () => {
  it("allows up to the limit within the window, then blocks", () => {
    expect(slidingWindow([], 0, 2, 1000).ok).toBe(true);
    expect(slidingWindow([0], 100, 2, 1000).ok).toBe(true);
    expect(slidingWindow([0, 100], 200, 2, 1000)).toEqual({ ok: false, retryAfterMs: 800 });
  });

  it("frees a slot once the oldest hit leaves the window", () => {
    expect(slidingWindow([0], 999, 1, 1000).ok).toBe(false);
    expect(slidingWindow([0], 1000, 1, 1000).ok).toBe(true);
  });

  it("waits for the right hit when there are more than the limit, in any order", () => {
    // 3 hits, limit 2: a slot frees when the 2nd-newest (at 500) leaves
    expect(slidingWindow([900, 0, 500], 950, 2, 1000)).toEqual({ ok: false, retryAfterMs: 550 });
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
