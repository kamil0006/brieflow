import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path);

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = await verifySessionToken(token);

  if (!userId && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (userId && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // static assets stay public: the browser fetches the PWA manifest without
  // the session cookie, so redirecting it (or the icons) to /login would
  // make the app impossible to install
  matcher: ["/((?!_next/static|_next/image|manifest\\.webmanifest|icons/|icon\\.svg|apple-icon\\.png).*)"],
};
