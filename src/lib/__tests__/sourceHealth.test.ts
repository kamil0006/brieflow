import { describe, expect, it } from "vitest";
import { sourceHealth, STALE_AFTER_DAYS, toStatusUpdate } from "@/lib/sourceHealth";

const now = Date.parse("2026-11-18T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const okStatus = {
  lastAttemptAt: new Date(now),
  lastSuccessAt: new Date(now),
  lastError: null,
  lastItemCount: 15,
  consecutiveFailures: 0,
};

describe("sourceHealth", () => {
  it("is ok when the last fetch worked and news keeps coming", () => {
    expect(sourceHealth({ status: okStatus, lastNewArticleAt: new Date(now - day), hidden: false, now })).toEqual({
      state: "ok",
    });
  });

  it("reports errors with the failure streak", () => {
    const status = { ...okStatus, lastSuccessAt: new Date(now - 3 * day), lastError: "Status code 403", consecutiveFailures: 4 };
    expect(sourceHealth({ status, lastNewArticleAt: null, hidden: false, now })).toEqual({
      state: "error",
      error: "Status code 403",
      failures: 4,
      lastSuccessAt: new Date(now - 3 * day),
    });
  });

  it("flags empty and stuck feeds", () => {
    expect(sourceHealth({ status: { ...okStatus, lastItemCount: 0 }, lastNewArticleAt: null, hidden: false, now }).state).toBe("empty");
    const old = new Date(now - (STALE_AFTER_DAYS + 1) * day);
    expect(sourceHealth({ status: okStatus, lastNewArticleAt: old, hidden: false, now })).toEqual({ state: "stale", lastNewAt: old });
  });

  it("hidden beats everything; never fetched is unknown", () => {
    expect(sourceHealth({ status: null, lastNewArticleAt: null, hidden: true, now }).state).toBe("hidden");
    expect(sourceHealth({ status: null, lastNewArticleAt: null, hidden: false, now }).state).toBe("unknown");
  });
});

describe("toStatusUpdate", () => {
  it("a success resets the failure streak, a failure keeps the last success", () => {
    const at = new Date(now);
    expect(toStatusUpdate({ sourceName: "X", ok: true, itemCount: 12, error: null }, at)).toEqual({
      lastAttemptAt: at,
      lastSuccessAt: at,
      lastError: null,
      lastItemCount: 12,
      consecutiveFailures: 0,
    });
    expect(toStatusUpdate({ sourceName: "X", ok: false, itemCount: 0, error: "timeout" }, at)).toEqual({
      lastAttemptAt: at,
      lastError: "timeout",
      lastItemCount: 0,
    });
  });
});
