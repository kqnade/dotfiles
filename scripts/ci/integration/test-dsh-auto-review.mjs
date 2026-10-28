#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('Usage: node scripts/ci/integration/test-dsh-auto-review.mjs <auto-review module>');
const source = readFileSync(modulePath, 'utf8');
const start = source.indexOf('async function classifyRisk(');
const end = source.indexOf('\n}', start) + 2;
assert.ok(start >= 0 && end > start, 'review classifier must exist in the pinned DSH build');
const createClassifier = new Function('snapshotAutoReview', 'deepFreeze', 'REVIEW_POLICY', 'reviewUserText', 'readDecision',
  `${source.slice(start, end)}; return classifyRisk;`);

function classifier(provider) {
  return createClassifier(
    () => ({ provider, model: 'review-model' }),
    Object.freeze,
    'review-policy',
    () => 'pending-action',
    result => result,
  );
}

async function request(provider, stream = options => options) {
  const signal = new AbortController().signal;
  const options = await classifier(provider)({
    workingDirectory: { ensure: async () => '/workspace' },
    llm: { stream },
  }, {}, {}, signal);
  return { options, signal };
}

test('Codex review omits temperature while preserving the review request', async () => {
  const { options, signal } = await request('openai-codex');
  assert.equal(Object.hasOwn(options, 'temperature'), false);
  assert.deepEqual(options, {
    provider: 'openai-codex',
    model: 'review-model',
    system: 'review-policy',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'pending-action' }] }],
    signal,
  });
  assert.ok(Object.isFrozen(options));
});

test('other providers retain deterministic review sampling', async () => {
  for (const provider of ['anthropic', 'deepseek', 'ollama']) {
    const { options } = await request(provider);
    assert.equal(options.temperature, 0);
    assert.equal(options.provider, provider);
  }
});

test('reviewer failures propagate rather than allowing the tool', async () => {
  const error = new Error('reviewer unavailable');
  await assert.rejects(request('openai-codex', () => { throw error; }), error);
});
