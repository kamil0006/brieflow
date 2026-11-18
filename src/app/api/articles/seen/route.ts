import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { dictionaries } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";

// "Mark all as read" for the articles currently on screen. They're marked
// read *without* a readAt: they leave the feed like any read article, but
// History (which lists what was actually opened, by readAt) stays clean.
//
// { ids, seen: true }  → mark the unread ones among ids
// { ids, seen: false } → undo: unmark only rows this endpoint marked
//                        (read without readAt), never real reads

const MAX_IDS = 1000; // the list itself never shows more

export async function POST(req: NextRequest) {
  const cookieLocale = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const dict = dictionaries[isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE];

  const userId = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) {
    return NextResponse.json({ error: dict.errors.invalidRequest }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: dict.errors.invalidRequest }, { status: 400 });
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const ids = Array.isArray(record.ids)
    ? [...new Set(record.ids.filter((id): id is string => typeof id === "string"))]
    : [];
  if (ids.length === 0 || ids.length > MAX_IDS || typeof record.seen !== "boolean") {
    return NextResponse.json({ error: dict.errors.invalidRequest }, { status: 400 });
  }

  if (!record.seen) {
    const { count } = await prisma.articleState.updateMany({
      where: { userId, articleId: { in: ids }, read: true, readAt: null },
      data: { read: false },
    });
    return NextResponse.json({ changed: count });
  }

  // only articles that exist, and that this person hasn't read yet
  const [articles, states] = await Promise.all([
    prisma.article.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.articleState.findMany({
      where: { userId, articleId: { in: ids } },
      select: { articleId: true, read: true },
    }),
  ]);
  const stateByArticle = new Map(states.map((s) => [s.articleId, s]));
  const toCreate = articles.filter((a) => !stateByArticle.has(a.id)).map((a) => a.id);
  const toUpdate = states.filter((s) => !s.read).map((s) => s.articleId);

  await prisma.$transaction([
    prisma.articleState.createMany({
      data: toCreate.map((articleId) => ({ userId, articleId, read: true })),
    }),
    prisma.articleState.updateMany({
      where: { userId, articleId: { in: toUpdate } },
      data: { read: true, readAt: null },
    }),
  ]);

  // the client undoes exactly these, nothing else
  return NextResponse.json({ ids: [...toCreate, ...toUpdate] });
}
