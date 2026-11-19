import { describe, expect, it } from "vitest";
import { isAccountLimitReached, isSignupAllowed, maxAccounts } from "@/lib/auth/signupPolicy";

describe("isSignupAllowed", () => {
  it("is open when no list is set", () => {
    expect(isSignupAllowed("anyone@example.com", "")).toBe(true);
  });

  it("only lets listed emails in, ignoring spaces and case", () => {
    const list = " Me@Example.com , friend@example.com";
    expect(isSignupAllowed("me@example.com", list)).toBe(true);
    expect(isSignupAllowed("friend@example.com", list)).toBe(true);
    expect(isSignupAllowed("stranger@example.com", list)).toBe(false);
  });
});

describe("maxAccounts", () => {
  it("means no cap when unset, empty, zero or not a number", () => {
    expect(maxAccounts("")).toBe(null);
    expect(maxAccounts("0")).toBe(null);
    expect(maxAccounts("abc")).toBe(null);
    expect(maxAccounts("1.5")).toBe(null);
  });

  it("reads a positive whole number", () => {
    expect(maxAccounts(" 2 ")).toBe(2);
  });
});

describe("isAccountLimitReached", () => {
  it("blocks sign-up once the cap is reached", () => {
    expect(isAccountLimitReached(1, 2)).toBe(false);
    expect(isAccountLimitReached(2, 2)).toBe(true);
    expect(isAccountLimitReached(5, 2)).toBe(true);
  });

  it("never blocks without a cap", () => {
    expect(isAccountLimitReached(1000, null)).toBe(false);
  });
});
