import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askUser } from '../../dot_pi/agent/extensions/lib/ask-user.mjs';

function context(select, input = async () => assert.fail('Unexpected text input')) {
  return { hasUI: true, ui: { select, input }, aborted: false, abort() { this.aborted = true; } };
}

const params = { question: 'Which change should come first?', options: ['Tests', 'Documentation'] };

test('returns the explicitly selected option and structured answer', async () => {
  const controller = new AbortController();
  const ctx = context(async (title, choices, options) => {
    assert.equal(title, params.question);
    assert.deepEqual(choices, ['1. Tests', '2. Documentation', 'Other (type your own)']);
    assert.equal(options.signal, controller.signal);
    assert.equal(options.timeout, undefined);
    return choices[1];
  });
  const result = await askUser(params, controller.signal, ctx);
  assert.deepEqual(result.details, { question: params.question, answer: 'Documentation', source: 'option' });
  assert.match(result.content[0].text, /Documentation/);
  assert.equal(ctx.aborted, false);
});

test('allows a custom answer instead of the offered choices', async () => {
  const controller = new AbortController();
  const ctx = context(async (_title, choices) => choices.at(-1), async (title, _placeholder, options) => {
    assert.equal(title, params.question);
    assert.equal(options.signal, controller.signal);
    return '  Investigate the failure first  ';
  });
  const result = await askUser(params, controller.signal, ctx);
  assert.deepEqual(result.details, {
    question: params.question, answer: 'Investigate the failure first', source: 'input',
  });
});

test('supports a free-form question without choices', async () => {
  const ctx = context(async () => assert.fail('Unexpected selection'), async () => 'macOS');
  const result = await askUser({ question: 'Which platform?' }, undefined, ctx);
  assert.deepEqual(result.details, { question: 'Which platform?', answer: 'macOS', source: 'input' });
});

test('cancelling the picker stops the turn without an answer', async () => {
  const ctx = context(async () => undefined);
  await assert.rejects(askUser(params, undefined, ctx), /cancelled.*no answer/i);
  assert.equal(ctx.aborted, true);
});

for (const answer of [undefined, '', '   ']) {
  test(`empty or cancelled text input is not consent: ${JSON.stringify(answer)}`, async () => {
    const ctx = context(async (_title, choices) => choices.at(-1), async () => answer);
    await assert.rejects(askUser(params, undefined, ctx), /cancelled.*no answer/i);
    assert.equal(ctx.aborted, true);
  });
}

test('headless sessions fail explicitly rather than choosing an option', async () => {
  const ctx = { hasUI: false };
  await assert.rejects(askUser(params, undefined, ctx), /interactive UI/);
});

test('a pre-aborted operation opens no dialog', async () => {
  const controller = new AbortController();
  controller.abort();
  const ctx = context(async () => assert.fail('Unexpected selection'));
  await assert.rejects(askUser(params, controller.signal, ctx), { name: 'AbortError' });
});

test('an abort during selection cannot become an answer', async () => {
  const controller = new AbortController();
  const ctx = context(async (_title, choices) => { controller.abort(); return choices[0]; });
  await assert.rejects(askUser(params, controller.signal, ctx), { name: 'AbortError' });
});

test('an abort during text input cannot become an answer', async () => {
  const controller = new AbortController();
  const ctx = context(async (_title, choices) => choices.at(-1), async () => {
    controller.abort();
    return 'Yes';
  });
  await assert.rejects(askUser(params, controller.signal, ctx), { name: 'AbortError' });
});

test('unexpected picker responses fail rather than granting consent', async () => {
  const ctx = context(async () => 'Invented answer');
  await assert.rejects(askUser(params, undefined, ctx), /Invalid selection/);
});

test('UI errors are propagated', async () => {
  const ctx = context(async () => { throw new Error('Dialog unavailable'); });
  await assert.rejects(askUser(params, undefined, ctx), /Dialog unavailable/);
});
