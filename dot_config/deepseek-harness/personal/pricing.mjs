import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export function loadPricingCatalog(entry) {
  const adapter = createRequire(realpathSync(entry)).resolve('@deepseek-ai/dsh-llm-pi-ai/package.json');
  for (const directory of createRequire(adapter).resolve.paths('@earendil-works/pi-ai')) {
    const root = join(directory, '@earendil-works/pi-ai');
    let manifest;
    try { manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (manifest.name !== '@earendil-works/pi-ai') throw new Error('Invalid pricing package');
    return JSON.parse(readFileSync(join(root, 'dist/providers/data/openai-codex.json'), 'utf8'));
  }
  throw new Error('DSH pricing catalog is unavailable');
}

export function catalogRates(catalog, provider, model, usage) {
  if (provider !== 'openai-codex' || !catalog || typeof catalog !== 'object') return null;
  const matches = Object.values(catalog).flatMap(group => Object.values(group ?? {}))
    .filter(entry => entry?.provider === provider && entry.id === model);
  if (matches.length !== 1) return null;
  const cost = matches[0].cost;
  if (!cost || typeof cost !== 'object') return null;
  let selected = cost;
  if (cost.tiers !== undefined) {
    if (!Array.isArray(cost.tiers)) return null;
    const counts = [usage.inputTokens, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0];
    if (counts.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (!Number.isSafeInteger(total)) return null;
    let threshold = -1;
    for (const tier of cost.tiers) {
      if (!Number.isSafeInteger(tier.inputTokensAbove) || tier.inputTokensAbove < 0) return null;
      if (total > tier.inputTokensAbove && tier.inputTokensAbove > threshold) {
        selected = { ...cost, ...tier };
        threshold = tier.inputTokensAbove;
      }
    }
  }
  if (usage.cacheWriteTokens > 0 && selected.cacheWrite1h !== undefined && selected.cacheWrite1h !== selected.cacheWrite) return null;
  const rates = Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite'].map(key => [key, selected[key]]));
  if (Object.values(rates).some(n => !Number.isFinite(n) || n < 0) || !Object.values(rates).some(n => n > 0)) return null;
  return rates;
}
