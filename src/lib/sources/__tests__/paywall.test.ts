import { describe, expect, it } from "vitest";
import { isPaywalledUrl } from "@/lib/sources/paywall";

describe("isPaywalledUrl", () => {
  it("catches paywalled sites, with or without subdomains", () => {
    expect(isPaywalledUrl("https://www.nytimes.com/2026/11/20/tech/x.html")).toBe(true);
    expect(isPaywalledUrl("https://ft.com/content/abc")).toBe(true);
    expect(isPaywalledUrl("https://www.marketwatch.com/story/x")).toBe(true);
    expect(isPaywalledUrl("https://someone.medium.com/post")).toBe(true);
  });

  it("leaves free sites alone, including lookalike names", () => {
    expect(isPaywalledUrl("https://arstechnica.com/x")).toBe(false);
    expect(isPaywalledUrl("https://www.theguardian.com/business/x")).toBe(false);
    expect(isPaywalledUrl("https://notft.com/x")).toBe(false);
    expect(isPaywalledUrl("https://news.ycombinator.com/item?id=1")).toBe(false);
  });

  it("doesn't throw on garbage", () => {
    expect(isPaywalledUrl("not a url")).toBe(false);
  });
});
