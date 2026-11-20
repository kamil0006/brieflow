import { describe, expect, it } from "vitest";
import { briefKey, briefSystemPrompt, topicsList, visibleCategories } from "@/lib/ai/brief";

const CUTOFF = new Date("2026-10-30T08:00:00Z");

describe("daily brief per settings", () => {
  it("shares one brief between accounts with the same categories, in any order", () => {
    expect(briefKey("2026-10-30", "pl", ["Tech", "AI", "Gaming"], CUTOFF)).toBe(
      briefKey("2026-10-30", "pl", ["Gaming", "Tech", "AI"], CUTOFF),
    );
  });

  it("keeps different languages and different categories apart", () => {
    const base = briefKey("2026-10-30", "pl", ["AI"], CUTOFF);
    expect(briefKey("2026-10-30", "en", ["AI"], CUTOFF)).not.toBe(base);
    expect(briefKey("2026-10-30", "pl", ["AI", "Science"], CUTOFF)).not.toBe(base);
    expect(briefKey("2026-10-31", "pl", ["AI"], CUTOFF)).not.toBe(base);
  });

  it("keeps accounts that last refreshed at different times apart", () => {
    const base = briefKey("2026-10-30", "pl", ["AI"], CUTOFF);
    expect(briefKey("2026-10-30", "pl", ["AI"], new Date("2026-10-30T09:00:00Z"))).not.toBe(base);
  });

  it("names the reader's own topics in the prompt", () => {
    const categories = visibleCategories(["AI", "Gaming", "Tech", "Business", "Health", "Climate", "World", "History", "Culture", "Inne"]);
    expect(categories).toEqual(["Science", "Entertainment"]);
    const prompt = briefSystemPrompt(topicsList(categories, "pl"));
    expect(prompt).toContain("Nauka");
    expect(prompt).toContain("Rozrywka");
    expect(prompt).not.toMatch(/gry|technologi/i);
  });
});
