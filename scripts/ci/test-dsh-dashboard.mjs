import assert from 'node:assert/strict';
import test from 'node:test';
import { createCollector } from '../../dot_config/deepseek-harness/personal/telemetry.mjs';

function fixture(options = {}) {
  let time = 1000;
  const metrics = [], spans = [];
  const session = { header: {}, requestHeader: () => ({ config: { provider: 'openai-codex', model: 'test-model' } }) };
  const agent = { session };
  const collector = createCollector({ addMetric: r => metrics.push(r), addSpan: r => spans.push(r), now: () => time, ...options });
  return { collector, session, agent, metrics, spans, at: t => { time = t; },
    values: name => metrics.filter(r => r.name === name).map(r => r.value) };
}

test('session starts distinguish resume and compaction; gauges survive idle sampling and disposal', () => {
  const f = fixture();
  f.collector.created({ agent: f.agent, source: 'startup' });
  f.collector.created({ agent: f.agent, source: 'startup' });
  const resumed = { session: { ...f.session } };
  const compacted = { session: { ...f.session } };
  f.collector.created({ agent: resumed, source: 'resume' });
  f.collector.created({ agent: compacted, source: 'compact' });
  assert.deepEqual(f.values('dsh.session.count'), [1, 1, 1]);
  assert.deepEqual(f.metrics.filter(r => r.name === 'dsh.session.count').map(r => r.attributes.source), ['startup', 'resume', 'compact']);
  f.collector.status({ agent: f.agent, status: 'running' });
  f.collector.status({ agent: f.agent, status: 'running' });
  f.collector.sample();
  assert.equal(f.values('dsh.session.active').at(-1), 1);
  assert.equal(f.values('dsh.session.loaded').at(-1), 3);
  f.collector.dispose(f.session);
  f.collector.dispose(f.session);
  f.collector.sample();
  assert.equal(f.values('dsh.session.active').at(-1), 0);
  assert.equal(f.values('dsh.session.loaded').at(-1), 2);
  f.collector.clear();
  assert.equal(f.values('dsh.session.loaded').at(-1), 0);
});

test('turns measure live boundaries once and classify interruptions without reasons leaking', () => {
  const f = fixture();
  const start = { type: 'turn/start', seq: 1, time: 1000, data: { turn: 3 } };
  f.collector.event(f.session, start);
  f.collector.event(f.session, start);
  f.collector.event(f.session, { type: 'turn/end', seq: 2, time: 1350, data: { turn: 3, reason: { kind: 'aborted', reason: 'SECRET' } } });
  f.collector.event(f.session, { type: 'turn/end', seq: 3, time: 1350, data: { turn: 4, reason: { kind: 'interrupted' } } });
  assert.deepEqual(f.values('dsh.turn.count'), [1]);
  assert.deepEqual(f.values('dsh.turn.duration'), [350]);
  assert.deepEqual(f.values('dsh.turn.interrupted.count'), [1]);
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});

test('session metrics omit unselected models and turns use their first resolved request route', () => {
  const f = fixture();
  f.session.requestHeader = () => undefined;
  f.collector.created({ agent: f.agent, source: 'startup' });
  assert.equal(f.metrics.find(r => r.name === 'dsh.session.count').attributes.model, undefined);
  f.collector.event(f.session, { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } });
  f.session.requestHeader = () => ({ config: { provider: 'openai-codex', model: 'resolved-child' } });
  f.collector.stream({ agent: f.agent, frame: { type: 'start', turn: 1, attemptId: 'a' } });
  f.session.requestHeader = () => ({ config: { provider: 'ollama', model: 'next' } });
  f.collector.stream({ agent: f.agent, frame: { type: 'start', turn: 1, attemptId: 'b' } });
  f.collector.event(f.session, { type: 'turn/end', seq: 2, time: 1100, data: { turn: 1, reason: { kind: 'completed' } } });
  assert.equal(f.metrics.find(r => r.name === 'dsh.turn.count').attributes.model, 'resolved-child');
});

test('first response excludes accounting and empty deltas and is emitted once', () => {
  const f = fixture();
  f.collector.stream({ agent: f.agent, frame: { type: 'start', attemptId: 'a' } });
  const chunk = c => f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId: 'a', chunk: c } });
  chunk({ type: 'usage', usage: { inputTokens: 10 } });
  chunk({ type: 'text-delta', text: '' });
  f.at(1040);
  chunk({ type: 'reasoning-delta', text: 'SECRET' });
  f.at(1060);
  chunk({ type: 'text-delta', text: 'SECRET' });
  f.collector.stream({ agent: f.agent, frame: { type: 'end', attemptId: 'a', outcome: { kind: 'committed', eventType: 'assistant/message' } } });
  assert.deepEqual(f.values('dsh.request.first_response.duration'), [40]);
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});

test('tool-only responses have latency and finish failures have safe categories', () => {
  const f = fixture();
  const emit = frame => f.collector.stream({ agent: f.agent, frame });
  emit({ type: 'start', attemptId: 'tool' });
  f.at(1025);
  emit({ type: 'chunk', attemptId: 'tool', chunk: { type: 'tool-call-delta', id: 'SECRET', index: 0, name: 'bash', argumentsDelta: '' } });
  emit({ type: 'chunk', attemptId: 'tool', chunk: { type: 'finish', reason: { kind: 'error', failure: { status: 429, message: 'SECRET' } } } });
  emit({ type: 'end', attemptId: 'tool', outcome: { kind: 'committed', eventType: 'assistant/attempt' } });
  assert.deepEqual(f.values('dsh.request.first_response.duration'), [25]);
  assert.equal(f.metrics.find(r => r.name === 'dsh.request.count').attributes.error_class, 'rate_limit');
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});

test('retry events distinguish scheduled waits and actual starts with bounded failure classes', () => {
  const f = fixture();
  const event = { type: 'llm/retry', seq: 1, time: 1000, data: { delayMs: 500, failure: { status: 429, code: 'SECRET', message: 'SECRET' } } };
  f.collector.event(f.session, event);
  f.collector.event(f.session, event);
  f.collector.event(f.session, { type: 'llm/retry-started', seq: 2, time: 1500, data: {} });
  assert.deepEqual(f.values('dsh.request.retry.count'), [1]);
  assert.deepEqual(f.values('dsh.request.retry.started.count'), [1]);
  assert.deepEqual(f.values('dsh.request.retry.delay'), [500]);
  assert.equal(f.metrics.find(r => r.name === 'dsh.request.retry.count').attributes.error_class, 'rate_limit');
  assert.equal(JSON.stringify(f.metrics).includes('SECRET'), false);
});

test('subagent activations pair once without attributing external usage to the parent', () => {
  const f = fixture();
  const info = { runId: 'run', id: 'SECRET', provider: 'codex', local: false };
  f.collector.subagentStart(info);
  f.collector.subagentStart(info);
  f.at(1500);
  f.collector.subagentEnd({ ...info, stopReason: 'completed', lastAssistantMessage: ['SECRET'] });
  f.collector.subagentEnd({ ...info, stopReason: 'completed' });
  assert.deepEqual(f.values('dsh.subagent.started.count'), [1]);
  assert.deepEqual(f.values('dsh.subagent.count'), [1]);
  assert.deepEqual(f.values('dsh.subagent.duration'), [500]);
  assert.deepEqual(f.values('dsh.subagent.usage.unavailable.count'), [1]);
  assert.equal(f.metrics[0].attributes.backend, 'codex');
  assert.equal(f.metrics[0].attributes.model, undefined);
  assert.equal(JSON.stringify([f.metrics, f.spans]).includes('SECRET'), false);
});

test('native child usage is counted once on its own model and role', () => {
  const f = fixture();
  f.session.header.origin = 'subagent';
  const emit = frame => f.collector.stream({ agent: f.agent, frame });
  emit({ type: 'start', attemptId: 'child' });
  emit({ type: 'chunk', attemptId: 'child', chunk: { type: 'usage', usage: { inputTokens: 15, outputTokens: 3 } } });
  const end = { type: 'end', attemptId: 'child', outcome: { kind: 'committed', eventType: 'assistant/message' } };
  emit(end); emit(end);
  const usage = f.metrics.filter(r => r.name === 'dsh.token.usage');
  assert.equal(usage.length, 2);
  assert.ok(usage.every(r => r.attributes.agent_role === 'subagent' && r.attributes.model === 'test-model'));
});

test('request costs are fractional delta counts with unavailable coverage and no actual bill', () => {
  const rates = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
  const f = fixture({ getRates: () => rates });
  function run(attemptId, usage) {
    f.collector.stream({ agent: f.agent, frame: { type: 'start', attemptId } });
    f.collector.stream({ agent: f.agent, frame: { type: 'chunk', attemptId, chunk: { type: 'usage', usage } } });
    f.collector.stream({ agent: f.agent, frame: { type: 'end', attemptId, outcome: { kind: 'committed', eventType: 'assistant/message' } } });
  }
  run('ok', { inputTokens: 100, outputTokens: 20, cacheReadTokens: 500 });
  run('missing', { inputTokens: 100 });
  run('invalid', { inputTokens: 100, outputTokens: 20, cacheReadTokens: -1 });
  assert.deepEqual(f.values('dsh.cost.estimated.usage'), [0.0005]);
  assert.equal(f.metrics.find(r => r.name === 'dsh.cost.estimated.usage').type, 'count');
  assert.deepEqual(f.metrics.filter(r => r.name === 'dsh.cost.coverage.count').map(r => r.attributes.status), ['estimated', 'unavailable', 'unavailable']);
  assert.equal(f.metrics.some(r => r.name.includes('actual')), false);
});

test('normalized adapter failure codes retain bounded error classifications', async () => {
  for (const [code, expected] of Object.entries({ AUTH: 'authentication', RATE_LIMIT: 'rate_limit', SERVER: 'server', INVALID_REQUEST: 'client', TRANSPORT: 'network', TIMEOUT: 'timeout', SECRET: 'unknown' })) {
    const f = fixture();
    await f.collector.requestError({ agent: f.agent, failure: { code, message: 'SECRET' } }, async () => undefined);
    assert.equal(f.metrics.at(-1).attributes.error_class, expected);
  }
});

test('request error observer preserves recovery action and omits raw errors', async () => {
  const f = fixture();
  const action = { kind: 'retry' };
  assert.equal(await f.collector.requestError({ agent: f.agent, failure: { status: 503, message: 'SECRET' } }, async () => action), action);
  assert.deepEqual(f.values('dsh.request.error.count'), [1]);
  assert.equal(f.metrics.at(-1).attributes.error_class, 'server');
  assert.equal(JSON.stringify(f.metrics).includes('SECRET'), false);
});
