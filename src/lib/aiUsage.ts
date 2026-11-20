import { prisma } from "@/lib/prisma";

// What the app spends on OpenAI. Every call records the tokens the API
// reports; the cost is estimated from the price list below when the owner
// opens Settings. The real bill is in the OpenAI dashboard — this is for a
// quick look without leaving the app.

export type AiUsageKind = "classify" | "brief" | "catchup" | "ask" | "keyPoints";

type Usage = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

// USD per 1M tokens (input, output). Dated snapshots ("gpt-4o-mini-2024-07-18")
// match by prefix — the longest matching name wins.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
};

function envPrice(name: string): number | null {
  const value = Number(process.env[name]);
  return process.env[name] && Number.isFinite(value) && value >= 0 ? value : null;
}

// AI_PRICE_INPUT_PER_M / AI_PRICE_OUTPUT_PER_M override the list, for a
// model it doesn't know or after a price change
export function priceFor(model: string): { input: number; output: number } | null {
  const input = envPrice("AI_PRICE_INPUT_PER_M");
  const output = envPrice("AI_PRICE_OUTPUT_PER_M");
  if (input !== null && output !== null) return { input, output };
  const name = Object.keys(PRICES)
    .filter((known) => model === known || model.startsWith(`${known}-`))
    .sort((a, b) => b.length - a.length)[0];
  return name ? PRICES[name] : null;
}

// null when the model's price is unknown
export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const price = priceFor(model);
  if (!price) return null;
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}

// never lets bookkeeping break the feature that made the call
export async function recordAiUsage(kind: AiUsageKind, model: string, usage: Usage): Promise<void> {
  if (!usage) return;
  try {
    await prisma.aiUsage.create({
      data: {
        kind,
        model,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      },
    });
  } catch (error) {
    console.error("[ai-usage] could not record usage:", error);
  }
}

export type UsageRow = { kind: string; model: string; promptTokens: number; completionTokens: number };

export type UsageSummary = {
  costUsd: number;
  // true when some calls used a model without a known price — then costUsd
  // covers only the rest
  partial: boolean;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  byKind: { kind: string; costUsd: number; calls: number }[];
};

export function summarizeUsage(rows: UsageRow[]): UsageSummary {
  const byKind = new Map<string, { costUsd: number; calls: number }>();
  let costUsd = 0;
  let partial = false;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const row of rows) {
    const cost = estimateCostUsd(row.model, row.promptTokens, row.completionTokens);
    if (cost === null) partial = true;
    costUsd += cost ?? 0;
    promptTokens += row.promptTokens;
    completionTokens += row.completionTokens;
    const k = byKind.get(row.kind) ?? { costUsd: 0, calls: 0 };
    k.costUsd += cost ?? 0;
    k.calls += 1;
    byKind.set(row.kind, k);
  }
  return {
    costUsd,
    partial,
    calls: rows.length,
    promptTokens,
    completionTokens,
    byKind: [...byKind].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.costUsd - a.costUsd),
  };
}

function monthStart(now: Date, monthsBack: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
}

const usageSelect = { kind: true, model: true, promptTokens: true, completionTokens: true } as const;

// this calendar month (UTC), the previous one, and today
export async function loadUsageOverview(now: Date = new Date()) {
  const thisMonth = monthStart(now, 0);
  const lastMonth = monthStart(now, 1);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [current, previous, todayRows] = await Promise.all([
    prisma.aiUsage.findMany({ where: { createdAt: { gte: thisMonth } }, select: usageSelect }),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: lastMonth, lt: thisMonth } }, select: usageSelect }),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: today } }, select: usageSelect }),
  ]);
  return {
    thisMonth: summarizeUsage(current),
    lastMonth: summarizeUsage(previous),
    today: summarizeUsage(todayRows),
  };
}

// a year of history is plenty for a "this month vs last month" view
export async function pruneOldUsage(now: number = Date.now()): Promise<number> {
  const { count } = await prisma.aiUsage.deleteMany({
    where: { createdAt: { lt: new Date(now - 400 * 24 * 60 * 60 * 1000) } },
  });
  return count;
}
