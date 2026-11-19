// every account can spend OpenAI credits (chat, key points, refreshes), so
// sign-up can be limited to known addresses. Empty or unset = open sign-up.
export function isSignupAllowed(email: string, allowList = process.env.SIGNUP_ALLOWED_EMAILS ?? ""): boolean {
  const allowed = allowList
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email);
}

// caps how many accounts can exist at all, whoever signs up. Unset, empty
// or 0 = no cap.
export function maxAccounts(value = process.env.MAX_ACCOUNTS ?? ""): number | null {
  const limit = Number(value.trim());
  return Number.isInteger(limit) && limit > 0 ? limit : null;
}

export function isAccountLimitReached(accountCount: number, limit = maxAccounts()): boolean {
  return limit !== null && accountCount >= limit;
}
