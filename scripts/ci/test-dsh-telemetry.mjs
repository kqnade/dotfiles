import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createCollector } from '../../dot_config/deepseek-harness/personal/telemetry.mjs';

test('native and nested tool spans use event times and preserve enclosure without payloads', () => {
  const f = fixture();
  f.collector.event(f.session, { type: 'tool/call', time: 1000, data: { callId: 'root', name: 'run_code', arguments: 'SECRET' } });
  f.collector.event(f.session, { type: 'tool/ptc-dispatch-start', time: 1010, data: { subCallId: 'child', parentCallId: 'root', name: 'bash', arguments: { command: 'SECRET' } } });
  f.collector.event(f.session, { type: 'tool/ptc-dispatch', time: 1030, data: { subCallId: 'child', parentCallId: 'root', name: 'bash', isError: true, content: ['SECRET'] } });
  f.collector.event(f.session, { type: 'tool/result', time: 1040, data: { message: { toolCallId: 'root', isError: false, content: ['SECRET'] } } });
  assert.equal(f.spans.length, 2);
  assert.equal(f.spans[0].attributes['parent.id'], f.spans[1].id);
  assert.equal(f.spans[0].attributes['duration.ms'], 20);
  assert.equal(f.spans[1].attributes['duration.ms'], 40);
  assert.equal(f.spans[0].attributes.success, false);
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});

test('orphan results and restored messages do not recount usage or tools', () => {
  const f = fixture();
  f.collector.event(f.session, { type: 'assistant/message', data: { usage: { inputTokens: 1000 } } });
  f.collector.event(f.session, { type: 'tool/result', time: 1000, data: { message: { toolCallId: 'missing', isError: false } } });
  assert.equal(f.metrics.length, 0);
  assert.equal(f.spans.length, 0);
});

test('rendered plugin registers live hooks, exports OTLP, and drains on unload', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-telemetry-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = new URL('../../dot_config/deepseek-harness/personal/', import.meta.url);
  await mkdir(join(dir, 'lib'));
  for (const file of ['package.json', 'new-relic.mjs', 'telemetry.mjs']) await copyFile(new URL(file, source), join(dir, file));
  for (const name of ['new-relic-exporter', 'otlp']) {
    const input = await readFile(new URL('lib/' + name + '.mjs.tmpl', source), 'utf8');
    const output = execFileSync('chezmoi', ['--source', new URL('../../', import.meta.url).pathname, 'execute-template'], { input, encoding: 'utf8' });
    await writeFile(join(dir, 'lib', name + '.mjs'), output);
  }
  const resolved = createRequire(join(dir, 'package.json')).resolve('@dotfiles/dsh-personal/new-relic');
  assert.equal(resolved, await realpath(join(dir, 'new-relic.mjs')));
  const plugin = await import(pathToFileURL(resolved));
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  process.env.DSH_NEW_RELIC_ENABLE = '1';
  process.env.DSH_NEW_RELIC_API_KEY = 'test-secret';
  const requests = [], callbacks = new Map(), cleanup = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, options }); return { status: 200, text: async () => '' }; });
  const ctx = { on: (name, fn) => callbacks.set(name, fn), effect: fn => cleanup.push(fn()) };
  plugin.apply(ctx);
  assert.equal(typeof callbacks.get('agent/assistant-stream'), 'function');
  const f = fixture();
  callbacks.get('agent/assistant-stream')({ agent: f.agent, frame: { type: 'start', attemptId: 'a', revision: 1 } });
  callbacks.get('agent/assistant-stream')({ agent: f.agent, frame: { type: 'end', attemptId: 'a', revision: 4, outcome: { kind: 'committed', eventType: 'assistant/message' } } });
  for (const dispose of cleanup.reverse()) await dispose();
  assert.ok(requests.length >= 2);
  assert.ok(requests.every(r => r.url.startsWith('https://otlp.nr-data.net/v1/')));
  assert.ok(requests.every(r => r.options.headers['Api-Key'] === 'test-secret'));
  assert.ok(requests.every(r => !r.options.body.includes('test-secret')));
  assert.ok(requests.some(r => r.options.body.includes('dsh.telemetry')));
  process.env.DSH_NEW_RELIC_ENABLE = '0';
  plugin.apply({ on() { assert.fail('disabled telemetry must not subscribe'); }, effect() { assert.fail('disabled telemetry must not create effects'); } });
});

test('failed finishes are not successful messages and unsafe usage is excluded', () => {
  const f = fixture();
  f.collector.stream({ agent: f.agent, frame: { type: 'start', attemptId: 'a', revision: 1 } });
  f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId: 'a', revision: 2, chunk: { type: 'usage', usage: { inputTokens: -1, outputTokens: NaN, reasoningTokens: Infinity, secret: 'SECRET' } } } });
  f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId: 'a', revision: 2, chunk: { type: 'finish', reason: { kind: 'error', message: 'SECRET' } } } });
  f.collector.stream({ agent: f.agent, frame: { type: 'end', attemptId: 'a', revision: 4, outcome: { kind: 'committed', eventType: 'assistant/message' } } });
  assert.equal(f.spans[0].attributes.success, false);
  assert.equal(f.spans[0].attributes.stop_reason, 'error');
  assert.equal(f.metrics.filter(r => r.name === 'dsh.token.usage').length, 0);
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});

test('cancelled partial responses are not successful without a finish chunk', () => {
  const f = fixture();
  f.collector.stream({ agent: f.agent, frame: { type: 'start', attemptId: 'a', revision: 1 } });
  f.collector.event(f.session, { type: 'assistant/message', seq: 7, data: { interrupted: true, message: { content: ['SECRET'] } } });
  f.collector.stream({ agent: f.agent, frame: { type: 'end', attemptId: 'a', revision: 2, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 7 } } });
  assert.equal(f.spans[0].attributes.success, false);
  assert.equal(f.spans[0].attributes.stop_reason, 'aborted');
  assert.equal(JSON.stringify(f.spans).includes('SECRET'), false);
});

function fixture() {
  const metrics = [], spans = [];
  let time = 1000;
  const collector = createCollector({ addMetric: r => metrics.push(r), addSpan: r => spans.push(r), now: () => time });
  const session = { requestHeader: () => ({ config: { provider: 'openai-codex', model: 'test-model' } }) };
  const agent = { session };
  return { collector, session, agent, metrics, spans, at: value => { time = value; } };
}

test('model attempts emit snapshot usage once with captured model and duration', () => {
  const f = fixture();
  f.collector.stream({ agent: f.agent, frame: { type: 'start', attemptId: 'a', revision: 1 } });
  f.at(1050);
  f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId: 'a', revision: 2,
    chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } } } });
  f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId: 'a', revision: 2,
    chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3 } } } });
  f.session.requestHeader = () => ({ config: { provider: 'ollama', model: 'other-model' } });
  f.at(1100);
  const end = { agent: f.agent, frame: { type: 'end', attemptId: 'a', revision: 4, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 1 } } };
  f.collector.stream(end);
  f.collector.stream(end);
  assert.equal(f.spans.length, 1);
  assert.equal(f.spans[0].attributes.model, 'test-model');
  assert.equal(f.spans[0].attributes['duration.ms'], 100);
  assert.deepEqual(f.metrics.filter(r => r.name === 'dsh.token.usage').map(r => [r.attributes.type, r.value]), [['input', 10], ['output', 5], ['cache_read', 3]]);
});

test('parallel sessions and abandoned attempts remain isolated and omit contents', () => {
  const f = fixture(), other = { session: { requestHeader: () => ({ config: { provider: 'ollama', model: 'local' } }) } };
  for (const agent of [f.agent, other]) f.collector.stream({ agent, frame: { type: 'start', attemptId: 'same', revision: 1 } });
  f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId: 'same', revision: 1, chunk: { type: 'text', text: 'SECRET' } } });
  f.collector.stream({ agent: f.agent, frame: { type: 'end', attemptId: 'same', revision: 1, outcome: { kind: 'abandoned', reason: 'SECRET' } } });
  f.collector.stream({ agent: other, frame: { type: 'end', attemptId: 'same', revision: 1, outcome: { kind: 'committed', eventType: 'assistant/message' } } });
  assert.equal(f.spans.length, 2);
  assert.notEqual(f.spans[0]['trace.id'], f.spans[1]['trace.id']);
  assert.equal(f.spans[0].attributes.success, false);
  assert.equal(f.spans[1].attributes.success, true);
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});
