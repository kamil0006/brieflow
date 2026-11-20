"use client";

import { useState, useTransition } from "react";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";
import { addMutedKeywordAction, removeMutedKeywordAction } from "@/lib/settings/actions";

export function MutedKeywordsList({
  keywords: initial,
  locale = "pl",
  maxKeywords,
  maxLength,
}: {
  keywords: string[];
  locale?: Locale;
  maxKeywords: number;
  maxLength: number;
}) {
  const dict = dictionaries[locale].settings;
  const [keywords, setKeywords] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const full = keywords.length >= maxKeywords;

  function add(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || full) return;
    setDraft("");
    startTransition(async () => {
      const next = await addMutedKeywordAction(value);
      if (next) setKeywords(next);
    });
  }

  function remove(keyword: string) {
    setKeywords((current) => current.filter((k) => k !== keyword));
    startTransition(async () => {
      const next = await removeMutedKeywordAction(keyword);
      if (next) setKeywords(next);
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 mt-4">
      <h2 className="text-sm font-medium text-text">{dict.mutedHeading}</h2>
      <p className="text-sm text-text-muted mt-0.5">{dict.mutedBody}</p>

      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={maxLength}
          disabled={full}
          placeholder={dict.mutedPlaceholder}
          aria-label={dict.mutedHeading}
          className="flex-1 min-w-0 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-signal disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || full || pending}
          className="shrink-0 rounded-md bg-surface-raised px-3 py-1.5 text-sm text-text hover:bg-border transition-colors disabled:opacity-50"
        >
          {dict.mutedAdd}
        </button>
      </form>
      {full && <p className="text-xs text-text-faint mt-2">{dict.mutedLimit}</p>}

      {keywords.length === 0 ? (
        <p className="text-xs text-text-faint mt-3">{dict.mutedEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <li
              key={keyword}
              className="flex items-center gap-1 rounded-md bg-surface-raised pl-2.5 pr-1 py-1 text-sm text-text"
            >
              <span className="break-all">{keyword}</span>
              <button
                type="button"
                onClick={() => remove(keyword)}
                aria-label={`${dict.mutedRemove}: ${keyword}`}
                title={dict.mutedRemove}
                className="flex h-5 w-5 items-center justify-center rounded text-text-faint hover:text-text hover:bg-border transition-colors"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
