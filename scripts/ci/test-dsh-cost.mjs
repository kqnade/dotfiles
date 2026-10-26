import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateApiCostUsd } from '../../dot_config/deepseek-harness/personal/cost.mjs';

const rates = Object.freeze({ input: 2, output: 8, cacheRead: 0.5, cacheWrite: 3 });
const usage = Object.freeze({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100, reasoningTokens: 300 });

function close(actual, expected) {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) < 1e-12, 'Expected ' + expected + ', got ' + actual);
}

test('prices uncached input, output and separate cache buckets without double-counting reasoning', () => {
  close(estimateApiCostUsd(usage, rates), 0.0073);
  close(estimateApiCostUsd({ ...usage, reasoningTokens: 0 }, rates), 0.0073);
});

test('omitted optional cache and reasoning counts follow DSH zero semantics', () => {
  close(estimateApiCostUsd({ inputTokens: 1000, outputTokens: 500 }, rates), 0.006);
});

test('retains sub-cent currency instead of rounding to cents', () => {
  close(estimateApiCostUsd({ inputTokens: 1, outputTokens: 1 }, rates), 0.00001);
});

test('explicit zero usage and explicitly known free rates are valid', () => {
  assert.equal(estimateApiCostUsd({ inputTokens: 0, outputTokens: 0 }, rates), 0);
  assert.equal(estimateApiCostUsd(usage, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), 0);
});

test('missing usage or rates are unavailable, even for zero usage', () => {
  for (const value of [undefined, null, {}, [], 'unknown', 0]) {
    assert.equal(estimateApiCostUsd(value, rates), null);
    assert.equal(estimateApiCostUsd(usage, value), null);
  }
  for (const key of ['inputTokens', 'outputTokens']) {
    const partial = { ...usage };
    delete partial[key];
    assert.equal(estimateApiCostUsd(partial, rates), null);
  }
  for (const key of Object.keys(rates)) {
    const partial = { ...rates };
    delete partial[key];
    assert.equal(estimateApiCostUsd(usage, partial), null);
    assert.equal(estimateApiCostUsd({ inputTokens: 0, outputTokens: 0 }, partial), null);
  }
});

test('rejects invalid token counts and impossible reasoning subsets', () => {
  for (const key of Object.keys(usage)) {
    for (const value of [-1, 0.5, NaN, Infinity, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(estimateApiCostUsd({ ...usage, [key]: value }, rates), null, key + ': ' + value);
    }
  }
  assert.equal(estimateApiCostUsd({ ...usage, reasoningTokens: 501 }, rates), null);
});

test('rejects invalid rates and nonfinite computed totals', () => {
  for (const key of Object.keys(rates)) {
    for (const value of [-1, NaN, Infinity, '1', null, undefined]) {
      assert.equal(estimateApiCostUsd(usage, { ...rates, [key]: value }), null);
    }
  }
  assert.equal(estimateApiCostUsd({ ...usage, inputTokens: Number.MAX_SAFE_INTEGER }, { ...rates, input: Number.MAX_VALUE }), null);
});

test('accepts fractional per-million rates without mutating inputs', () => {
  close(estimateApiCostUsd(Object.freeze({ inputTokens: 10, outputTokens: 20 }), Object.freeze({ input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 })), 0.0000135);
});
