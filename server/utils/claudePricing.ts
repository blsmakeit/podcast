// Claude API pricing in USD per 1K tokens (as of mid-2025)
// Store costs as microdollars (integer) to avoid floating-point drift

const PRICING: Record<string, { inputPer1K: number; outputPer1K: number }> = {
  "claude-sonnet-4-6":       { inputPer1K: 0.003,  outputPer1K: 0.015 },
  "claude-sonnet-4-5":       { inputPer1K: 0.003,  outputPer1K: 0.015 },
  "claude-opus-4-6":         { inputPer1K: 0.015,  outputPer1K: 0.075 },
  "claude-haiku-4-5":        { inputPer1K: 0.0008, outputPer1K: 0.004 },
};

const DEFAULT_PRICING = { inputPer1K: 0.003, outputPer1K: 0.015 };

/**
 * Returns cost in microdollars (1 USD = 1_000_000 microdollars).
 * Using integers avoids floating-point accumulation errors.
 */
export function calcCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  const usd = (inputTokens / 1000) * p.inputPer1K + (outputTokens / 1000) * p.outputPer1K;
  return Math.round(usd * 1_000_000);
}

/** Format microdollars as a human-readable USD string */
export function formatCost(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
