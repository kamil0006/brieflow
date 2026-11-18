"use client";

import { useRouter } from "next/navigation";
import { useDismissibleRow } from "@/components/DismissibleArticle";
import { showToast } from "@/components/Toast";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";

async function setDismissed(articleId: string, dismissed: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function DismissButton({
  articleId,
  title,
  locale = "pl",
}: {
  articleId: string;
  title: string;
  locale?: Locale;
}) {
  const router = useRouter();
  const row = useDismissibleRow();
  const dict = dictionaries[locale];

  function handleClick() {
    // the card goes away right now; the server catches up in the background
    row?.hide();
    const request = setDismissed(articleId, true);

    showToast({
      message: dict.dismissToast.dismissed(title),
      action: {
        label: dict.dismissToast.undo,
        onClick: async () => {
          row?.show();
          // wait for the dismiss to land first, or the undo could reach the
          // server before it and get overwritten
          await request;
          if (!(await setDismissed(articleId, false))) {
            showToast({ message: dict.dismissToast.failed });
          }
          router.refresh();
        },
      },
    });

    request.then((ok) => {
      if (ok) {
        // counts, top picks and the list's tail catch up with the change
        router.refresh();
      } else {
        row?.show();
        showToast({ message: dict.dismissToast.failed });
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      data-shortcut="dismiss"
      aria-label={dict.a11y.dismiss}
      title={dict.a11y.dismissTitle}
      className="shrink-0 text-text-faint hover:text-[var(--priority-5)] transition-colors"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M1 1l12 12M13 1L1 13" />
      </svg>
    </button>
  );
}
