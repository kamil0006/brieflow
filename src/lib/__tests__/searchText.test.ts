import { describe, expect, it } from "vitest";
import { normalizeForSearch, searchFilter, searchTextFor } from "@/lib/searchText";

describe("normalizeForSearch", () => {
  it("ignores case and diacritics, including Polish letters", () => {
    expect(normalizeForSearch("ŁÓDŹ")).toBe("lodz");
    expect(normalizeForSearch("Zażółć gęślą jaźń")).toBe("zazolc gesla jazn");
    expect(normalizeForSearch("Pokémon")).toBe("pokemon");
  });

  it("collapses whitespace", () => {
    expect(normalizeForSearch("  open \n  ai  ")).toBe("open ai");
  });
});

describe("searchTextFor", () => {
  it("joins title and summary so both are searchable", () => {
    expect(searchTextFor("Rover finds water", "Łazik znalazł wodę na Marsie.")).toBe(
      "rover finds water lazik znalazl wode na marsie.",
    );
    expect(searchTextFor("Title only", null)).toBe("title only");
  });
});

describe("searchFilter", () => {
  it("requires every word, in any order", () => {
    expect(searchFilter("Wyciek  DANYCH")).toEqual({
      AND: [{ searchText: { contains: "wyciek" } }, { searchText: { contains: "danych" } }],
    });
  });

  it("adds no condition for an empty query", () => {
    expect(searchFilter("   ")).toEqual({});
  });
});
