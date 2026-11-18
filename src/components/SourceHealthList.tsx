import { categoryLabel } from "@/lib/categories";
import { relativeTime } from "@/lib/format";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";
import type { SourceHealth } from "@/lib/sourceHealth";
import { loadSourceHealth } from "@/lib/sourceStatus";

// problems first, then the ones that are fine, then the ones not in use
const ORDER: Record<SourceHealth["state"], number> = {
  error: 0,
  empty: 1,
  stale: 2,
  ok: 3,
  unknown: 4,
  skipped: 5,
};

const DOT: Record<SourceHealth["state"], string> = {
  ok: "var(--status-ok)",
  error: "var(--priority-5)",
  empty: "var(--priority-4)",
  stale: "var(--priority-4)",
  unknown: "var(--text-faint)",
  skipped: "var(--text-faint)",
};

export async function SourceHealthList({ locale }: { locale: Locale }) {
  const dict = dictionaries[locale].sourceHealth;
  const rows = (await loadSourceHealth()).sort(
    (a, b) => ORDER[a.health.state] - ORDER[b.health.state] || a.sourceName.localeCompare(b.sourceName),
  );

  const inUse = rows.filter((r) => r.health.state !== "skipped");
  const problems = inUse.filter((r) => ["error", "empty", "stale"].includes(r.health.state)).length;

  function detail(row: (typeof rows)[number]): string {
    const { health } = row;
    switch (health.state) {
      case "ok":
        return row.lastNewAt ? dict.ok(relativeTime(row.lastNewAt, locale)) : dict.okNoArticles;
      case "error":
        return dict.error(
          health.failures,
          health.lastSuccessAt ? relativeTime(health.lastSuccessAt, locale) : null,
        );
      case "empty":
        return dict.empty;
      case "stale":
        return dict.stale(relativeTime(health.lastNewAt, locale));
      case "skipped":
        return dict.skipped(row.category ? categoryLabel(row.category, locale) : "");
      case "unknown":
        return dict.unknown;
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-text">{dict.heading}</h2>
        <span className="text-xs text-text-muted">
          {problems > 0 ? dict.summaryProblems(problems, inUse.length) : dict.summaryOk(inUse.length)}
        </span>
      </div>
      <p className="text-sm text-text-muted mt-0.5">{dict.body}</p>

      <ul className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.sourceName} className="py-2.5 flex gap-3">
            <span
              aria-hidden
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: DOT[row.health.state] }}
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm ${row.health.state === "skipped" ? "text-text-faint" : "text-text"}`}
              >
                {row.sourceName}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{detail(row)}</p>
              {row.health.state === "error" && row.health.error && (
                <p className="text-xs text-text-faint mt-1 font-mono break-words">{row.health.error}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
