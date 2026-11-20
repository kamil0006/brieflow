import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateCostUsd, priceFor, summarizeUsage } from "@/lib/aiUsage";
import { isAdminEmail } from "@/lib/auth/admin";

describe("priceFor", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches dated snapshots to the longest known name", () => {
    expect(priceFor("gpt-4o-mini-2024-07-18")).toEqual({ input: 0.15, output: 0.6 });
    expect(priceFor("gpt-4o-2024-08-06")).toEqual({ input: 2.5, output: 10 });
    expect(priceFor("gpt-4.1-mini")).toEqual({ input: 0.4, output: 1.6 });
  });

  it("doesn't guess an unknown model", () => {
    expect(priceFor("some-new-model")).toBeNull();
    expect(estimateCostUsd("some-new-model", 1000, 1000)).toBeNull();
  });

  it("lets the environment override the list", () => {
    vi.stubEnv("AI_PRICE_INPUT_PER_M", "1");
    vi.stubEnv("AI_PRICE_OUTPUT_PER_M", "2");
    expect(priceFor("some-new-model")).toEqual({ input: 1, output: 2 });
  });
});

describe("summarizeUsage", () => {
  it("adds up cost per kind and flags unknown prices", () => {
    const s = summarizeUsage([
      { kind: "classify", model: "gpt-4o-mini", promptTokens: 1_000_000, completionTokens: 0 },
      { kind: "classify", model: "gpt-4o-mini", promptTokens: 0, completionTokens: 1_000_000 },
      { kind: "ask", model: "mystery", promptTokens: 10, completionTokens: 10 },
    ]);
    expect(s.costUsd).toBeCloseTo(0.75);
    expect(s.partial).toBe(true);
    expect(s.calls).toBe(3);
    expect(s.byKind[0]).toEqual({ kind: "classify", costUsd: expect.closeTo(0.75), calls: 2 });
  });
});

describe("isAdminEmail", () => {
  it("matches the configured list, ignoring case and spaces", () => {
    expect(isAdminEmail("Owner@Example.com", " owner@example.com , other@example.com")).toBe(true);
    expect(isAdminEmail("friend@example.com", "owner@example.com")).toBe(false);
    expect(isAdminEmail("owner@example.com", "")).toBe(false);
  });
});
