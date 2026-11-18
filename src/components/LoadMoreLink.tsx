"use client";

import Link, { useLinkStatus } from "next/link";

function Label({ idle, pending }: { idle: string; pending: string }) {
  const { pending: isPending } = useLinkStatus();
  return <>{isPending ? pending : idle}</>;
}

export function LoadMoreLink({ href, label, pendingLabel }: { href: string; label: string; pendingLabel: string }) {
  return (
    // scroll={false}: the new rows appear below, the reader stays where they were
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      className="block w-full rounded-md border border-border py-2.5 text-center text-sm text-text-muted hover:text-text hover:border-text-faint transition-colors"
    >
      <Label idle={label} pending={pendingLabel} />
    </Link>
  );
}
