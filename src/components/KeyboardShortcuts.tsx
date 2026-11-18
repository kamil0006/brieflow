"use client";

import { useEffect, useRef, useState } from "react";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";

// Keyboard shortcuts for the list and the reader. Each key just clicks or
// focuses an element tagged with data-shortcut="…", so a shortcut always
// does exactly what the button does (optimistic dismiss + undo included).
//
// List selection is real focus on the card's title link: Enter opens it
// natively, screen readers follow along, and the card highlight is plain
// CSS (:has(:focus-visible)) — no selection state to keep in sync.

type Scope = "list" | "reader";

const CARD = "main [data-article-card]";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CARD));
}

function clickIn(root: ParentNode, action: string): boolean {
  const el = root.querySelector<HTMLElement>(`[data-shortcut="${action}"]`);
  if (!el) return false;
  el.click();
  return true;
}

export function KeyboardShortcuts({ scope, locale = "pl" }: { scope: Scope; locale?: Locale }) {
  const dict = dictionaries[locale].shortcuts;
  const [helpOpen, setHelpOpen] = useState(false);
  // index of the last selected card, so after a dismiss (which removes the
  // focused card) j/k carry on from the same spot
  const lastIndex = useRef(-1);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (helpOpen) closeRef.current?.focus();
  }, [helpOpen]);

  useEffect(() => {
    function currentIndex(): number {
      const card = document.activeElement?.closest<HTMLElement>("[data-article-card]");
      return card ? cards().indexOf(card) : -1;
    }

    function select(index: number) {
      const list = cards();
      if (list.length === 0) return;
      const i = Math.max(0, Math.min(index, list.length - 1));
      list[i].querySelector<HTMLElement>('[data-shortcut="open"]')?.focus({ preventScroll: true });
      list[i].scrollIntoView({ block: "nearest" });
      lastIndex.current = i;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      // the onboarding tour owns the keyboard while it's open
      if (document.querySelector("[data-onboarding]")) return;

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        return;
      }
      if (helpOpen) return;

      if (scope === "list") {
        const index = currentIndex();
        const current = index >= 0 ? cards()[index] : null;
        switch (e.key) {
          case "j":
            e.preventDefault();
            select(index >= 0 ? index + 1 : Math.max(lastIndex.current, 0));
            return;
          case "k":
            e.preventDefault();
            select((index >= 0 ? index : Math.max(lastIndex.current, 0)) - 1);
            return;
          case "o":
            if (current) clickIn(current, "open");
            return;
          case "s":
            if (current) clickIn(current, "save");
            return;
          case "c":
            if (current) clickIn(current, "discuss");
            return;
          case "d":
            if (current && clickIn(current, "dismiss")) {
              // the card hides on the next render — then select whatever
              // took its place
              requestAnimationFrame(() => select(index));
            }
            return;
          case "/": {
            const search = document.querySelector<HTMLInputElement>('[data-shortcut="search"]');
            if (search) {
              e.preventDefault();
              search.focus();
              search.select();
            }
            return;
          }
        }
      } else {
        const main = document.querySelector("main") ?? document;
        switch (e.key) {
          case "n":
          case "j":
            clickIn(document, "next");
            return;
          case "b":
            clickIn(main, "back");
            return;
          case "o":
            clickIn(main, "original");
            return;
          case "s":
            clickIn(main, "save");
            return;
          case "c":
            clickIn(main, "discuss");
            return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scope, helpOpen]);

  const items = scope === "list" ? dict.list : dict.reader;

  return (
    <>
      {/* only where there's a real keyboard + mouse; hidden on phones */}
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        aria-label={dict.title}
        title={`${dict.title} (?)`}
        className="hidden pointer-fine:flex fixed bottom-4 right-4 z-40 h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-sm text-text-muted hover:text-text hover:border-text-faint transition-colors"
      >
        ?
      </button>

      {helpOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-5 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 id="shortcuts-title" className="font-serif text-lg text-text">
                {dict.title}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setHelpOpen(false)}
                className="text-sm text-text-muted hover:text-text transition-colors"
              >
                {dict.close}
              </button>
            </div>
            <dl className="mt-4 space-y-2">
              {[...items, { keys: ["?"], label: dict.toggleHelp }, { keys: ["Esc"], label: dict.escape }].map(
                ({ keys, label }) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-6 rounded border border-border bg-surface px-1.5 py-0.5 text-center font-sans text-xs text-text"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
