/**
 * Estimate API-equivalent USD, not an actual charge or subscription bill.
 * Rates are explicitly known USD per million tokens: input, output, cacheRead,
 * cacheWrite, with any context tier and cache TTL already resolved by the caller.
 * Callers must not supply unknown-price catalog placeholders as zero.
 * DSH inputTokens excludes caches; outputTokens already includes reasoning.
 * Input/output counts are required. Omitted cache/reasoning counts mean zero in
 * DSH usage; present values must be valid. Returns null for unavailable data.
 * No currency rounding is applied.
 * @param {object} usage DSH TokenUsage.
 * @param {{input: number, output: number, cacheRead: number, cacheWrite: number}} rates
 * @returns {number | null}
 */
export function estimateApiCostUsd(usage, rates) {
  if (!isRecord(usage) || !isRecord(rates)) return null;
  const counts = {};
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']) {
    const required = key === 'inputTokens' || key === 'outputTokens';
    const value = Object.hasOwn(usage, key) ? usage[key] : required ? undefined : 0;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    counts[key] = value;
  }
  if (counts.reasoningTokens > counts.outputTokens) return null;
  let total = 0;
  for (const [tokenKey, rateKey] of [
    ['inputTokens', 'input'], ['outputTokens', 'output'],
    ['cacheReadTokens', 'cacheRead'], ['cacheWriteTokens', 'cacheWrite'],
  ]) {
    const rate = rates[rateKey];
    if (!Object.hasOwn(rates, rateKey) || !Number.isFinite(rate) || rate < 0) return null;
    total += (counts[tokenKey] / 1_000_000) * rate;
  }
  return Number.isFinite(total) ? total : null;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
