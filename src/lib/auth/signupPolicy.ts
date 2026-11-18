// every account can spend OpenAI credits (chat, key points, refreshes), so
// sign-up can be limited to known addresses. Empty or unset = open sign-up.
export function isSignupAllowed(email: string, allowList = process.env.SIGNUP_ALLOWED_EMAILS ?? ""): boolean {
  const allowed = allowList
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email);
}
