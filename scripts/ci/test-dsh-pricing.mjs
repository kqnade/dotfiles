import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogRates, loadPricingCatalog } from '../../dot_config/deepseek-harness/personal/pricing.mjs';

const rates = { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 2.5 };
const model = { id: 'test', provider: 'openai-codex', cost: rates };
const catalog = { api: { 'chat:test': model } };
test('catalog lookup uses exact provider/model and rejects unknown or placeholder prices', () => {
  assert.deepEqual(catalogRates(catalog, 'openai-codex', 'test', { inputTokens: 2, outputTokens: 1 }), rates);
  assert.equal(catalogRates(catalog, 'ollama', 'test', {}), null);
  assert.equal(catalogRates(catalog, 'openai-codex', 'missing', {}), null);
  assert.equal(catalogRates({ api: { zero: { ...model, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } } }, 'openai-codex', 'test', {}), null);
});
test('tiers use aggregate prompt tokens including caches and reject ambiguous cache TTL', () => {
  const high = { inputTokensAbove: 100, input: 4, output: 12, cacheRead: 0.4, cacheWrite: 5 };
  const tiered = { api: { test: { ...model, cost: { ...rates, tiers: [high] } } } };
  assert.equal(catalogRates(tiered, 'openai-codex', 'test', { inputTokens: 20, cacheReadTokens: 80 }).input, 2);
  assert.equal(catalogRates(tiered, 'openai-codex', 'test', { inputTokens: 20, cacheReadTokens: 81 }).input, 4);
  assert.equal(catalogRates(tiered, 'openai-codex', 'test', { inputTokens: NaN }), null);
  const ttl = { api: { test: { ...model, cost: { ...rates, cacheWrite1h: 4 } } } };
  assert.equal(catalogRates(ttl, 'openai-codex', 'test', { inputTokens: 1, cacheWriteTokens: 1 }), null);
});
test('loads only static public model data from the running DSH dependency tree', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pricing-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'cli.js'), '');
  const adapter = join(dir, 'node_modules/@deepseek-ai/dsh-llm-pi-ai');
  const pi = join(dir, 'node_modules/@earendil-works/pi-ai');
  mkdirSync(adapter, { recursive: true });
  mkdirSync(join(pi, 'dist/providers/data'), { recursive: true });
  writeFileSync(join(adapter, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-llm-pi-ai', exports: { './package.json': './package.json' } }));
  writeFileSync(join(pi, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-ai', version: '1.4.0' }));
  writeFileSync(join(pi, 'dist/providers/data/openai-codex.json'), JSON.stringify(catalog));
  assert.deepEqual(loadPricingCatalog(join(dir, 'cli.js')), catalog);
  writeFileSync(join(pi, 'dist/providers/data/openai-codex.json'), '{');
  assert.throws(() => loadPricingCatalog(join(dir, 'cli.js')), SyntaxError);
});
