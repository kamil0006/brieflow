import { loadUsageOverview, type UsageSummary } from "@/lib/aiUsage";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";

function usd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

// owner-only: the settings page renders this only for ADMIN_EMAILS
export async function AiCostPanel({ locale }: { locale: Locale }) {
  const dict = dictionaries[locale].aiCosts;
  const { thisMonth, lastMonth, today } = await loadUsageOverview();
  const number = new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US");
  const kindLabel = (kind: string) => (dict.kinds as Record<string, string>)[kind] ?? kind;
  const partial = thisMonth.partial || lastMonth.partial || today.partial;

  const tile = (label: string, summary: UsageSummary, big = false) => (
    <div className="rounded-md bg-surface-raised px-3 py-2">
      <p className="text-xs text-text-faint">{label}</p>
      <p className={`${big ? "text-xl" : "text-base"} text-text tabular-nums mt-0.5`}>{usd(summary.costUsd)}</p>
      <p className="text-xs text-text-faint mt-0.5">{dict.calls(summary.calls)}</p>
    </div>
  );

  return (
    <section className="rounded-lg border border-border bg-surface p-4 mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-text">{dict.heading}</h2>
        <span className="text-xs text-text-faint">{dict.ownerOnly}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {tile(dict.thisMonth, thisMonth, true)}
        {tile(dict.today, today)}
        {tile(dict.lastMonth, lastMonth)}
      </div>

      {thisMonth.byKind.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {thisMonth.byKind.map((k) => (
            <li key={k.kind} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="text-text-muted">{kindLabel(k.kind)}</span>
              <span className="text-text tabular-nums">
                {usd(k.costUsd)} <span className="text-xs text-text-faint">· {dict.calls(k.calls)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-text-faint mt-3">
        {dict.tokens(number.format(thisMonth.promptTokens), number.format(thisMonth.completionTokens))}
      </p>
      {partial && <p className="text-xs text-text-faint mt-1">{dict.unknownPrice}</p>}
      <p className="text-xs text-text-faint mt-1">{dict.note}</p>
    </section>
  );
}
