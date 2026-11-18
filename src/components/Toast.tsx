"use client";

import { useEffect, useRef, useState } from "react";

// One toast slot for the whole app (bottom centre). A new toast replaces the
// current one, so quick actions in a row — dismissing three articles, hiding
// a category, a refresh finishing — never stack on top of each other.

export type ToastAction = { label: string; onClick: () => void };
export type ToastOptions = { message: string; action?: ToastAction; durationMs?: number };

const TOAST_EVENT = "app:toast";
const DEFAULT_DURATION_MS = 6000;

export function showToast(options: ToastOptions) {
  window.dispatchEvent(new CustomEvent<ToastOptions>(TOAST_EVENT, { detail: options }));
}

export function ToastHost() {
  // the id makes React treat each toast as new, so its enter animation replays
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastOptions>).detail;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setToast({ ...detail, id: Date.now() });
      timeoutRef.current = setTimeout(() => setToast(null), detail.durationMs ?? DEFAULT_DURATION_MS);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleAction() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const action = toast?.action;
    setToast(null);
    action?.onClick();
  }

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {toast && (
        <div
          key={toast.id}
          className="toast-enter pointer-events-auto flex max-w-full items-center gap-3 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm text-text shadow-lg"
        >
          <span className="min-w-0 truncate">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={handleAction}
              className="shrink-0 font-medium text-signal hover:opacity-80 transition-opacity"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
