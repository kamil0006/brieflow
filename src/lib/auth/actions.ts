"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dictionaries } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";
import { isAccountLimitReached, isSignupAllowed } from "@/lib/auth/signupPolicy";
import { slidingWindow } from "@/lib/rateLimit";
import { clearUsage, recentUsage, recordUsage } from "@/lib/usageLimit";
import {
  encryptSession,
  hashPassword,
  sessionExpiry,
  SESSION_COOKIE_NAME,
  verifyPasswordHash,
} from "@/lib/auth/session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
// the app is on the public internet — after this many wrong passwords for
// one email in the window, that email can't log in until the window frees up
const MAX_LOGIN_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type AuthState = { error: string } | undefined;

async function startSession(userId: string) {
  const cookieStore = await cookies();
  const expiresAt = sessionExpiry();
  const token = await encryptSession(userId, expiresAt);
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

async function currentDict() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  return dictionaries[isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE];
}

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const dict = await currentDict();

  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string).trim().toLowerCase() : "";
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  const failKey = `loginFail:${email}`;
  const now = Date.now();
  const lockout = email
    ? slidingWindow(await recentUsage(failKey, LOGIN_WINDOW_MS, now), now, MAX_LOGIN_FAILURES, LOGIN_WINDOW_MS)
    : { ok: true as const };
  if (!lockout.ok) {
    return { error: dict.login.tooManyAttempts(Math.max(1, Math.ceil(lockout.retryAfterMs / 60000))) };
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = user ? await verifyPasswordHash(password, user.passwordHash) : false;

  if (!user || !valid) {
    // counted for unknown emails too, so the answer doesn't reveal which
    // addresses have an account
    if (email) await recordUsage(failKey);
    // slow down brute-force guessing a little
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { error: dict.login.invalidCredentials };
  }

  await clearUsage(failKey);
  await startSession(user.id);
  redirect("/");
}

export async function signup(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const dict = await currentDict();

  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string).trim().toLowerCase() : "";
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";
  const confirmPassword =
    typeof formData.get("confirmPassword") === "string" ? (formData.get("confirmPassword") as string) : "";

  if (!EMAIL_PATTERN.test(email)) {
    return { error: dict.signup.invalidEmail };
  }
  if (!isSignupAllowed(email)) {
    return { error: dict.signup.signupClosed };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: dict.signup.passwordTooShort };
  }
  if (password !== confirmPassword) {
    return { error: dict.signup.passwordMismatch };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: dict.signup.emailTaken };
  }

  const passwordHash = await hashPassword(password);
  // count and create together, so two sign-ups at once can't both slip
  // under the cap
  const user = await prisma.$transaction(async (tx) => {
    if (isAccountLimitReached(await tx.user.count())) return null;
    return tx.user.create({ data: { email, passwordHash } });
  });
  if (!user) {
    return { error: dict.signup.accountLimitReached };
  }

  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
