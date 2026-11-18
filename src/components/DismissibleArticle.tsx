"use client";

import { createContext, useContext, useMemo, useState } from "react";

// Lets a card disappear the moment it's dismissed, instead of waiting for the
// server round-trip and a full list refresh. The card hides itself; the
// DismissButton inside it decides when (hide on click, show again on undo or
// when the request fails).

type DismissibleRow = { hide: () => void; show: () => void };

const DismissibleRowContext = createContext<DismissibleRow | null>(null);

export function useDismissibleRow() {
  return useContext(DismissibleRowContext);
}

export function DismissibleArticle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const row = useMemo<DismissibleRow>(
    () => ({ hide: () => setHidden(true), show: () => setHidden(false) }),
    [],
  );

  if (hidden) return null;

  return (
    <DismissibleRowContext.Provider value={row}>
      <article data-article-card className={className}>
        {children}
      </article>
    </DismissibleRowContext.Provider>
  );
}
