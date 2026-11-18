"use client";

import { useSyncExternalStore } from "react";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";
import { isNewArticle, readNewSince, subscribeNewSince } from "@/lib/newSince";

export function NewBadge({ fetchedAt, locale = "pl" }: { fetchedAt: Date; locale?: Locale }) {
  // the marker lives in localStorage, so the server render (null) never shows
  // the badge and the browser adds it after hydration — no mismatch
  const newSince = useSyncExternalStore(subscribeNewSince, readNewSince, () => null);
  if (!isNewArticle(fetchedAt, newSince)) return null;

  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-signal">
      {dictionaries[locale].article.new}
    </span>
  );
}
