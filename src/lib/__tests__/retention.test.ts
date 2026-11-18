import { describe, expect, it } from "vitest";
import { expiredArticlesWhere, retentionCutoff } from "@/lib/retention";

describe("retention", () => {
  const now = Date.parse("2026-11-18T12:00:00.000Z");

  it("cuts off the given number of days back", () => {
    expect(retentionCutoff(now, 30).toISOString()).toBe("2026-10-19T12:00:00.000Z");
  });

  it("expires old articles unless saved or actually opened", () => {
    const cutoff = retentionCutoff(now, 30);
    expect(expiredArticlesWhere(cutoff)).toEqual({
      fetchedAt: { lt: cutoff },
      NOT: {
        articleStates: {
          // bulk "mark as read" leaves readAt empty, so it doesn't keep anything
          some: { OR: [{ saved: true }, { read: true, readAt: { not: null } }] },
        },
      },
    });
  });
});
