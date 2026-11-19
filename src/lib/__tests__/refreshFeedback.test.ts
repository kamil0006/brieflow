import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n/dictionary";
import { activeNewSince, isNewArticle, NEW_BADGE_TTL_MS } from "@/lib/newSince";

describe("refresh result message", () => {
  const result = dictionaries.pl.refreshButton.result;

  it("uses the right Polish plural forms", () => {
    expect(result(1, 0, false)).toBe("1 nowy news");
    expect(result(3, 0, false)).toBe("3 nowe newsy");
    expect(result(5, 0, false)).toBe("5 nowych newsów");
    expect(result(12, 0, false)).toBe("12 nowych newsów");
    expect(result(22, 0, false)).toBe("22 nowe newsy");
    expect(result(10, 1, false)).toBe("10 nowych newsów, w tym 1 ważny");
    expect(result(10, 13, false)).toBe("10 nowych newsów, w tym 13 ważnych");
  });

  it("says when nothing new came in and when sources failed", () => {
    expect(result(0, 0, false)).toBe("Brak nowych newsów — jesteś na bieżąco");
    expect(result(2, 2, true)).toBe("2 nowe newsy, w tym 2 ważne · część źródeł nie odpowiedziała");
  });
});

describe("new badge", () => {
  const since = "2026-11-18T10:00:00.000Z";
  const sinceMs = Date.parse(since);

  it("marks articles fetched by the last refresh", () => {
    expect(isNewArticle(new Date(sinceMs + 1000), since)).toBe(true);
    expect(isNewArticle(new Date(sinceMs), since)).toBe(true);
    expect(isNewArticle(new Date(sinceMs - 1000), since)).toBe(false);
    expect(isNewArticle(new Date(sinceMs + 1000), null)).toBe(false);
  });

  it("drops the marker once the refresh is old or unreadable", () => {
    expect(activeNewSince(since, sinceMs + 60_000)).toBe(since);
    expect(activeNewSince(since, sinceMs + NEW_BADGE_TTL_MS + 1)).toBeNull();
    expect(activeNewSince("garbage", sinceMs)).toBeNull();
    expect(activeNewSince(null, sinceMs)).toBeNull();
  });

  it("expires 12h after the refresh, even when `since` is much older", () => {
    // this account last refreshed 2 days before; someone else fetched news since
    const twoDaysBefore = new Date(sinceMs - 48 * 60 * 60 * 1000).toISOString();
    const stored = JSON.stringify({ since: twoDaysBefore, at: sinceMs });
    expect(activeNewSince(stored, sinceMs + 60_000)).toBe(twoDaysBefore);
    expect(activeNewSince(stored, sinceMs + NEW_BADGE_TTL_MS + 1)).toBeNull();
    expect(activeNewSince('{"since": 5}', sinceMs)).toBeNull();
    expect(activeNewSince("{broken", sinceMs)).toBeNull();
  });
});
