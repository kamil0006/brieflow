"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showToast } from "@/components/Toast";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";

async function markSeen(ids: string[], seen: boolean): Promise<{ ids?: string[] } | null> {
  try {
    const res = await fetch("/api/articles/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, seen }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// clears the list on screen in one go — e.g. after reading the catch-up
// summary, when the rest of what came in while you were away isn't worth it
export function MarkAllSeenButton({ ids, locale = "pl" }: { ids: string[]; locale?: Locale }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const dict = dictionaries[locale].markAllSeen;

  async function handleClick() {
    setPending(true);
    const result = await markSeen(ids, true);
    setPending(false);
    if (!result?.ids) {
      showToast({ message: dict.failed });
      return;
    }
    const marked = result.ids;
    router.refresh();
    showToast({
      message: dict.done(marked.length),
      durationMs: 8000,
      action: {
        label: dict.undo,
        onClick: async () => {
          if (!(await markSeen(marked, false))) showToast({ message: dict.failed });
          router.refresh();
        },
      },
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs text-text-muted hover:text-text disabled:opacity-50 transition-colors"
    >
      {pending ? dict.pending : dict.label(ids.length)}
    </button>
  );
}
