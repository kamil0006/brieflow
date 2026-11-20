import { describe, expect, it } from "vitest";
import {
  demotionsFrom,
  dropFor,
  hasDemotions,
  NO_DEMOTIONS,
  personalPriority,
  sortByPersonalPriority,
} from "@/lib/personalPriority";

const dismissed = (category: string, sourceName = "X") => ({ dismissed: true, opened: false, category, sourceName });
const opened = (category: string, sourceName = "X") => ({ dismissed: false, opened: true, category, sourceName });

describe("dropFor", () => {
  it("ignores a few dismissals and mixed reactions", () => {
    expect(dropFor({ dismissed: 2, opened: 0 })).toBe(0);
    expect(dropFor({ dismissed: 5, opened: 4 })).toBe(0);
  });

  it("lowers by 1 when dismissing clearly dominates, by 2 when it's overwhelming", () => {
    expect(dropFor({ dismissed: 3, opened: 0 })).toBe(1);
    expect(dropFor({ dismissed: 6, opened: 3 })).toBe(1);
    expect(dropFor({ dismissed: 8, opened: 2 })).toBe(2);
  });
});

describe("demotionsFrom", () => {
  it("counts per category and per source", () => {
    const d = demotionsFrom([
      dismissed("AI", "HN"), dismissed("AI", "HN"), dismissed("AI", "Dev.to"),
      opened("Gaming", "HN"), opened("Gaming", "HN"),
    ]);
    expect(d.categories).toEqual({ AI: 1 });
    // HN: 2 dismissed vs 2 opened — not demoted
    expect(d.sources).toEqual({});
  });

  it("someone with no dismissals gets the shared order", () => {
    expect(hasDemotions(demotionsFrom([opened("AI"), opened("Tech")]))).toBe(false);
  });
});

describe("personalPriority", () => {
  const d = { categories: { AI: 1 }, sources: { Kotaku: 2 } };

  it("lowers by the category and source drop, at most 2, never below 1", () => {
    expect(personalPriority({ priority: 5, category: "AI", sourceName: "HN" }, d)).toBe(4);
    expect(personalPriority({ priority: 5, category: "AI", sourceName: "Kotaku" }, d)).toBe(3);
    expect(personalPriority({ priority: 2, category: "Gaming", sourceName: "Kotaku" }, d)).toBe(1);
    expect(personalPriority({ priority: 5, category: "Science", sourceName: "NASA" }, d)).toBe(5);
  });

  it("leaves unclassified articles alone", () => {
    expect(personalPriority({ priority: null, category: null, sourceName: "HN" }, d)).toBeNull();
    expect(personalPriority({ priority: 3, category: "AI", sourceName: "HN" }, NO_DEMOTIONS)).toBe(3);
  });
});

describe("sortByPersonalPriority", () => {
  it("orders by personal priority, then newest, unclassified last", () => {
    const row = (id: string, priority: number | null, category: string, day: number) => ({
      id, priority, category, sourceName: "S", publishedAt: new Date(Date.UTC(2026, 10, day)),
    });
    const rows = [row("ai5", 5, "AI", 20), row("sci4", 4, "Science", 19), row("pending", null, "AI", 21), row("sci4new", 4, "Science", 20)];
    const order = sortByPersonalPriority(rows, { categories: { AI: 2 }, sources: {} }).map((r) => r.id);
    expect(order).toEqual(["sci4new", "sci4", "ai5", "pending"]);
  });
});
