import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createCollector } from '../../dot_config/deepseek-harness/personal/telemetry.mjs';

test('work collector labels metrics and spans without exporting event payloads', () => {
  const metrics = [], spans = [];
  const collector = createCollector({ profile: 'work', addMetric: m => metrics.push(m), addSpan: s => spans.push(s) });
  const session = { header: { origin: 'root', title: 'SECRET' }, requestHeader: () => ({ config: { provider: 'ollama', model: 'test' } }) };
  collector.created({ agent: { session }, source: 'startup' });
  collector.sample();
  collector.subagentStart({ runId: 'SECRET', provider: 'claude-code', local: false });
  collector.subagentEnd({ runId: 'SECRET', stopReason: 'completed', output: 'SECRET' });
  collector.event(session, { type: 'tool/call', time: 1000, data: { callId: 'SECRET', name: 'bash', arguments: 'SECRET' } });
  collector.event(session, { type: 'tool/result', time: 1010, data: { message: { toolCallId: 'SECRET', content: ['SECRET'] } } });
  assert.ok(metrics.length > 0 && spans.length > 0);
  assert.ok([...metrics, ...spans].every(item => item.attributes.profile === 'work'));
  assert.equal(JSON.stringify([metrics, spans]).includes('SECRET'), false);
});

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

for (const profile of ['personal', 'work']) test(`rendered ${profile} plugin registers live hooks, exports OTLP, and drains on unload`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-telemetry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'personal');
  await mkdir(dir);
  const source = new URL('../../dot_config/deepseek-harness/personal/', import.meta.url);
  await mkdir(join(dir, 'lib'));
  for (const file of ['package.json', 'new-relic.mjs', 'telemetry.mjs', 'cost.mjs', 'pricing.mjs']) await copyFile(new URL(file, source), join(dir, file));
  for (const name of ['new-relic-exporter', 'otlp']) {
    const input = await readFile(new URL('lib/' + name + '.mjs.tmpl', source), 'utf8');
    const output = execFileSync('chezmoi', ['--source', new URL('../../', import.meta.url).pathname, 'execute-template'], { input, encoding: 'utf8' });
    await writeFile(join(dir, 'lib', name + '.mjs'), output);
  }
  const pluginDir = join(root, profile);
  if (profile === 'work') {
    await mkdir(pluginDir);
    for (const file of ['package.json', 'new-relic.mjs']) await copyFile(new URL('../work/' + file, source), join(pluginDir, file));
    const patch = await readFile(new URL('../work/cordis.patch.yml', source), 'utf8');
    assert.ok(patch.includes('@dotfiles/dsh-work/new-relic'));
  }
  const resolved = createRequire(join(pluginDir, 'package.json')).resolve(`@dotfiles/dsh-${profile}/new-relic`);
  assert.equal(resolved, await realpath(join(pluginDir, 'new-relic.mjs')));
  const plugin = await import(pathToFileURL(resolved));
  const entry = join(dir, 'cli.js');
  await writeFile(entry, '');
  const adapter = join(dir, 'node_modules/@deepseek-ai/dsh-llm-pi-ai');
  const pi = join(dir, 'node_modules/@earendil-works/pi-ai');
  await mkdir(adapter, { recursive: true });
  await mkdir(join(pi, 'dist/providers/data'), { recursive: true });
  await writeFile(join(adapter, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-llm-pi-ai', exports: { './package.json': './package.json' } }));
  await writeFile(join(pi, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-ai' }));
  await writeFile(join(pi, 'dist/providers/data/openai-codex.json'), JSON.stringify({ api: { test: {
    id: 'test-model', provider: 'openai-codex', cost: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 2.5 },
  } } }));
  const previousEntry = process.argv[1];
  process.argv[1] = entry;
  t.after(() => { process.argv[1] = previousEntry; });
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  process.env.DSH_NEW_RELIC_ENABLE = '1';
  process.env.DSH_NEW_RELIC_API_KEY = 'test-secret';
  const requests = [], callbacks = new Map(), listenerOptions = new Map(), cleanup = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, options }); return { status: 200, text: async () => '' }; });
  const ctx = { logger: { warn(message) { assert.fail(message); } }, on: (name, fn, options) => { callbacks.set(name, fn); listenerOptions.set(name, options); }, effect: fn => cleanup.push(fn()) };
  plugin.apply(ctx);
  for (const hook of ['agent/assistant-stream', 'agent/created', 'agent/status', 'agent/request-error', 'subagent/start', 'subagent/end']) {
    assert.equal(typeof callbacks.get(hook), 'function');
  }
  assert.equal(listenerOptions.get('agent/request-error')?.prepend, true);
  const f = fixture();
  callbacks.get('agent/created')({ agent: f.agent, source: 'startup' });
  callbacks.get('agent/status')({ agent: f.agent, status: 'running' });
  callbacks.get('session/event')(f.session, { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } });
  callbacks.get('session/event')(f.session, { type: 'turn/end', seq: 2, time: 1200, data: { turn: 1, reason: { kind: 'completed' } } });
  callbacks.get('subagent/start')({ runId: 'run', provider: 'codex', local: false });
  callbacks.get('subagent/end')({ runId: 'run', stopReason: 'completed' });
  callbacks.get('agent/assistant-stream')({ agent: f.agent, frame: { type: 'start', attemptId: 'a', revision: 1 } });
  callbacks.get('agent/assistant-stream')({ agent: f.agent, frame: { type: 'chunk', attemptId: 'a', revision: 2, chunk: { type: 'usage', usage: { inputTokens: 20, outputTokens: 2, cacheReadTokens: 80 } } } });
  callbacks.get('agent/assistant-stream')({ agent: f.agent, frame: { type: 'end', attemptId: 'a', revision: 4, outcome: { kind: 'committed', eventType: 'assistant/message' } } });
  for (const dispose of cleanup.reverse()) await dispose();
  assert.ok(requests.length >= 2);
  assert.ok(requests.every(r => r.url.startsWith('https://otlp.nr-data.net/v1/')));
  assert.ok(requests.every(r => r.options.headers['Api-Key'] === 'test-secret'));
  assert.ok(requests.every(r => !r.options.body.includes('test-secret')));
  assert.ok(requests.some(r => r.options.body.includes('dsh.telemetry')));
  const metricRequest = requests.find(r => r.url.endsWith('/metrics'));
  const exportedCache = JSON.parse(metricRequest.options.body).resourceMetrics[0].scopeMetrics[0].metrics
    .filter(r => r.name === 'dsh.cache.token.usage');
  assert.deepEqual(exportedCache.map(r => r.sum.dataPoints[0].asInt), ['80', '20']);
  const exported = JSON.parse(metricRequest.options.body).resourceMetrics[0].scopeMetrics[0].metrics;
  for (const metric of exported) {
    for (const point of (metric.sum ?? metric.gauge).dataPoints) {
      assert.equal(point.attributes.find(a => a.key === 'profile').value.stringValue, profile);
    }
  }
  const cost = exported.find(r => r.name === 'dsh.cost.estimated.usage');
  assert.ok(Math.abs(cost.sum.dataPoints[0].asDouble - 0.000072) < 1e-12);
  assert.equal(cost.sum.aggregationTemporality, 1);
  for (const name of ['dsh.session.count', 'dsh.turn.count', 'dsh.subagent.started.count', 'dsh.subagent.usage.unavailable.count']) {
    assert.equal(exported.find(r => r.name === name).sum.dataPoints[0].asInt, '1');
  }
  assert.equal(exported.find(r => r.name === 'dsh.session.active').gauge.dataPoints[0].asInt, '0');
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

function completeUsage(f, attemptId, snapshots) {
  f.collector.stream({ agent: f.agent, frame: { type: 'start', attemptId, revision: 1 } });
  snapshots.forEach((usage, index) => f.collector.stream({ agent: f.agent,
    frame: { type: 'chunk', attemptId, revision: index + 2, chunk: { type: 'usage', usage } } }));
  const end = { agent: f.agent, frame: { type: 'end', attemptId, revision: snapshots.length + 2,
    outcome: { kind: 'committed', eventType: 'assistant/message' } } };
  f.collector.stream(end);
  f.collector.stream(end);
}

const cacheMetrics = f => f.metrics.filter(r => r.name === 'dsh.cache.token.usage');

test('cache accounting matches DSH read / (read + uncached) using final snapshots', () => {
  const f = fixture();
  completeUsage(f, 'a', [{ inputTokens: 10, cacheReadTokens: 10 },
    { inputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 500, outputTokens: 200 }]);
  assert.deepEqual(cacheMetrics(f).map(r => [r.attributes.type, r.value, r.type]),
    [['cache_read', 80, 'count'], ['input', 20, 'count']]);
  assert.equal(cacheMetrics(f)[0].attributes.model, 'test-model');
});

test('cache samples remain paired for token-weighted aggregation', () => {
  const f = fixture();
  completeUsage(f, 'small', [{ inputTokens: 0, cacheReadTokens: 10 }]);
  completeUsage(f, 'large', [{ inputTokens: 90, cacheReadTokens: 0 }]);
  completeUsage(f, 'unknown', [{ inputTokens: 900 }]);
  completeUsage(f, 'missing-input', [{ cacheReadTokens: 800 }]);
  const read = cacheMetrics(f).filter(r => r.attributes.type === 'cache_read').reduce((n, r) => n + r.value, 0);
  const input = cacheMetrics(f).filter(r => r.attributes.type === 'input').reduce((n, r) => n + r.value, 0);
  assert.equal(read / (read + input), 0.1);
  assert.equal(cacheMetrics(f).length, 4);
  assert.equal(f.metrics.find(r => r.name === 'dsh.token.usage' && r.value === 900)?.attributes.type, 'input');
});

test('unavailable or unsafe cache usage does not become a fabricated zero-hit sample', () => {
  for (const usage of [{}, { inputTokens: 0, cacheReadTokens: 0 },
    { inputTokens: 10 }, { cacheReadTokens: 10 },
    { inputTokens: 10, cacheReadTokens: -1 }, { inputTokens: NaN, cacheReadTokens: 10 },
    { inputTokens: 10, cacheReadTokens: Infinity }, { inputTokens: 10, cacheReadTokens: 0.5 },
    { inputTokens: Number.MAX_SAFE_INTEGER, cacheReadTokens: 1 }]) {
    const f = fixture();
    completeUsage(f, 'a', [{ inputTokens: 10, cacheReadTokens: 90 }, usage]);
    assert.equal(cacheMetrics(f).length, 0, JSON.stringify(usage));
  }
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
