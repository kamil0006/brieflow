import { describe, expect, it } from "vitest";
import { parseStoredKeyPoints } from "@/lib/reader";

describe("parseStoredKeyPoints", () => {
  it("reads the per-language format", () => {
    expect(parseStoredKeyPoints('{"pl":["a"],"en":["b"]}', null)).toEqual({ pl: ["a"], en: ["b"] });
  });

  it("maps an old plain array to the language it was written in", () => {
    expect(parseStoredKeyPoints('["a","b"]', "en")).toEqual({ en: ["a", "b"] });
  });

  it("ignores broken or unknown data", () => {
    expect(parseStoredKeyPoints("not json", "pl")).toEqual({});
    expect(parseStoredKeyPoints('["a"]', null)).toEqual({});
    expect(parseStoredKeyPoints('{"pl":[1,2]}', null)).toEqual({});
  });
});
