import { describe, expect, it } from "vitest";
import {
  addMutedKeyword,
  MAX_MUTED_KEYWORDS,
  matchesMutedKeyword,
  mutedKeywordsFilter,
  parseMutedKeywords,
  removeMutedKeyword,
  serializeMutedKeywords,
} from "@/lib/mutedKeywords";
import { searchTextFor } from "@/lib/searchText";

describe("matchesMutedKeyword", () => {
  const text = searchTextFor("GTA 6 has a surprising late-game cameo", "Gra Rockstara (GTA VI) zaskakuje.");

  it("matches from the start of a word, ignoring case", () => {
    expect(matchesMutedKeyword(text, ["GTA 6"])).toBe(true);
    expect(matchesMutedKeyword(text, ["gta vi"])).toBe(true);
    expect(matchesMutedKeyword(text, ["rockstar"])).toBe(true);
    expect(matchesMutedKeyword(text, ["cameo"])).toBe(true);
  });

  it("doesn't match in the middle of a word", () => {
    expect(matchesMutedKeyword(searchTextFor("He said the price will rise", null), ["ai"])).toBe(false);
    expect(matchesMutedKeyword(searchTextFor("New AI model released", null), ["ai"])).toBe(true);
  });

  it("ignores diacritics both ways", () => {
    const polish = searchTextFor("Łódź otwiera nowe muzeum", null);
    expect(matchesMutedKeyword(polish, ["lodz"])).toBe(true);
    expect(matchesMutedKeyword(polish, ["Łódź"])).toBe(true);
  });

  it("matches nothing with no keywords", () => {
    expect(matchesMutedKeyword(text, [])).toBe(false);
  });
});

describe("keyword list", () => {
  it("round-trips through storage", () => {
    const list = ["GTA 6", "Grand Theft Auto"];
    expect(parseMutedKeywords(serializeMutedKeywords(list))).toEqual(list);
    expect(parseMutedKeywords("")).toEqual([]);
  });

  it("skips empty, duplicate (any case/diacritics) and over-limit phrases", () => {
    expect(addMutedKeyword([], "  ")).toEqual([]);
    expect(addMutedKeyword(["GTA 6"], "gta  6")).toEqual(["GTA 6"]);
    expect(addMutedKeyword(["Łódź"], "lodz")).toEqual(["Łódź"]);
    expect(addMutedKeyword([], "  Vice   City ")).toEqual(["Vice City"]);
    const full = Array.from({ length: MAX_MUTED_KEYWORDS }, (_, i) => `k${i}`);
    expect(addMutedKeyword(full, "one more")).toBe(full);
  });

  it("removes exactly the given phrase", () => {
    expect(removeMutedKeyword(["GTA 6", "Vice City"], "GTA 6")).toEqual(["Vice City"]);
  });
});

describe("mutedKeywordsFilter", () => {
  it("is a no-op without keywords", () => {
    expect(mutedKeywordsFilter([])).toEqual({});
  });

  it("keeps articles that have no searchText yet", () => {
    const filter = mutedKeywordsFilter(["GTA 6"]);
    expect(filter.OR?.[0]).toEqual({ searchText: null });
  });
});
