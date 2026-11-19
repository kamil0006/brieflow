// Sets a new password for an existing account — there's no reset by email,
// so this is the way back in. Run it where the database lives:
//   locally:      npm run set-password
//   on Railway:   railway ssh, then npm run set-password
// The password is typed without echo and never shows up in shell history.
// Uses node:sqlite directly, so it works on the server without a build step.
import { DatabaseSync } from "node:sqlite";
import { stdin, stdout } from "node:process";
import readline from "node:readline";
import bcrypt from "bcryptjs";

// locally DATABASE_URL comes from .env; on Railway it's already set
try {
  await import("dotenv/config");
} catch {
  // no dotenv — fine when the variable is set in the environment
}

const MIN_PASSWORD_LENGTH = 8; // same as sign-up (src/lib/auth/actions.ts)

function dbPath() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) throw new Error("DATABASE_URL must be a SQLite file: URL");
  return url.slice("file:".length);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    if (hidden) {
      // print the prompt, then swallow every echoed keystroke
      rl._writeToOutput = (s) => {
        if (s.includes(question)) stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout.write("\n");
      resolve(answer);
    });
  });
}

const db = new DatabaseSync(dbPath());
const email = (await ask("Email: ")).trim().toLowerCase();
const user = db.prepare('SELECT id FROM "User" WHERE email = ?').get(email);
if (!user) {
  console.error(`No account with email ${email}.`);
  const all = db.prepare('SELECT email FROM "User" ORDER BY email').all();
  console.error(`Accounts: ${all.map((u) => u.email).join(", ") || "(none)"}`);
  process.exit(1);
}

const password = await ask("New password: ", { hidden: true });
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
if ((await ask("Repeat it: ", { hidden: true })) !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
db.prepare('UPDATE "User" SET "passwordHash" = ? WHERE id = ?').run(hash, user.id);
// a lockout from earlier failed attempts would still block the new password
db.prepare('DELETE FROM "UsageEvent" WHERE key = ?').run(`loginFail:${email}`);
console.log(`Password updated for ${email}.`);
