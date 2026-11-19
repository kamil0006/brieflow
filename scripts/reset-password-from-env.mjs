// One-time password reset from the Railway dashboard, without a terminal:
// set RESET_PASSWORD_EMAIL and RESET_PASSWORD in Variables, deploy, log in
// with the new password — then DELETE both variables (the password sits in
// them in plain text, and every restart would apply it again).
// Runs on every start (`npm start`), after migrations; does nothing unless
// both variables are set — and never stops the app from starting, so any
// failure is only logged.

const MIN_PASSWORD_LENGTH = 8; // same as sign-up (src/lib/auth/actions.ts)

const email = process.env.RESET_PASSWORD_EMAIL?.trim().toLowerCase();
const password = process.env.RESET_PASSWORD;

async function resetPassword() {
  const { DatabaseSync } = await import("node:sqlite");
  const { default: bcrypt } = await import("bcryptjs");
  const url = process.env.DATABASE_URL ?? "";
  const db = new DatabaseSync(url.startsWith("file:") ? url.slice("file:".length) : url);
  const user = db.prepare('SELECT id FROM "User" WHERE email = ?').get(email);

  if (!user) {
    const all = db.prepare('SELECT email FROM "User" ORDER BY email').all();
    console.error(`[reset-password] No account with email ${email}. Accounts: ${all.map((u) => u.email).join(", ") || "(none)"}`);
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[reset-password] Password must be at least ${MIN_PASSWORD_LENGTH} characters — nothing changed.`);
  } else {
    db.prepare('UPDATE "User" SET "passwordHash" = ? WHERE id = ?').run(await bcrypt.hash(password, 10), user.id);
    // a lockout from earlier failed attempts would still block the new password
    db.prepare('DELETE FROM "UsageEvent" WHERE key = ?').run(`loginFail:${email}`);
    console.log(`[reset-password] Password updated for ${email}. Now delete RESET_PASSWORD and RESET_PASSWORD_EMAIL from Variables.`);
  }
}

if (email && password) {
  try {
    await resetPassword();
  } catch (error) {
    console.error("[reset-password] Failed, nothing changed:", error instanceof Error ? error.message : error);
  }
}
