import { describe, expect, it } from "vitest";
import { isSignupAllowed } from "@/lib/auth/signupPolicy";

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
