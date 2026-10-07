import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDecisionReviewer, DECISION_EVENT } from '../../dot_pi/agent/extensions/lib/decision-review.mjs';
import extension from '../../dot_pi/agent/extensions/new-relic.ts';

for (const source of [undefined, 'git_cc', 'PRIVATE_UNKNOWN_SOURCE']) {
test(`Pi hooks deliver metadata through New Relic OTLP (${source ?? 'default'})`, async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.PI_NEW_RELIC_API_KEY;
  const savedEnable = process.env.PI_NEW_RELIC_ENABLE;
  const savedSource = process.env.PI_EXECUTION_SOURCE;
  if (source === undefined) delete process.env.PI_EXECUTION_SOURCE;
  else process.env.PI_EXECUTION_SOURCE = source;
  const bodies = [], handlers = new Map();
  const emitter = new EventEmitter();
  const events = { emit: (name, event) => emitter.emit(name, event), on: (name, handler) => {
    emitter.on(name, handler); return () => emitter.off(name, handler);
  } };
  process.env.PI_NEW_RELIC_API_KEY = 'TEST_KEY';
  process.env.PI_NEW_RELIC_ENABLE = '1';
  globalThis.fetch = async (url, options) => {
    bodies.push({ url, body: JSON.parse(options.body) });
    return { status: 202, json: async () => ({}) };
  };
  try {
    extension({ on: (name, handler) => handlers.set(name, handler), events, registerCommand() {}, getThinkingLevel: () => 'high' });
    const ctx = { cwd: '/tmp', mode: 'print', model: { provider: 'openai-codex', id: 'test' }, getContextUsage: () => ({ tokens: 10, contextWindow: 100, percent: 10 }) };
    for (const type of ['session_start', 'agent_start', 'turn_start']) await handlers.get(type)({ type }, ctx);
    await handlers.get('input')({ type: 'input', text: 'PRIVATE_PROMPT' }, ctx);
    await handlers.get('message_end')({ type: 'message_end', message: { role: 'assistant', provider: 'openai-codex', model: 'test', content: 'PRIVATE_OUTPUT', usage: { input: 8, output: 2, totalTokens: 10 } } }, ctx);
    const review = createDecisionReviewer({ env: { PI_DECISION_API_KEY: 'PRIVATE_DECISION_KEY' },
      observe: event => events.emit(DECISION_EVENT, event),
      fetchImpl: async () => new Response(JSON.stringify({ answers: [{ type: 'choice', name: 'guardian_risk', choice: 'low' }], usage: { input_tokens: 7, output_tokens: 1, total_tokens: 8 } })),
    });
    await review({ toolName: 'bash', input: { command: 'PRIVATE_COMMAND' }, cwd: '/PRIVATE_PATH' }, {
      branch: [{ type: 'message', message: { role: 'user', content: 'PRIVATE_REQUEST' } }], contextFiles: [],
    });
    for (const type of ['turn_end', 'agent_end', 'session_shutdown']) await handlers.get(type)({ type }, ctx);
    assert.equal(emitter.listenerCount(DECISION_EVENT), 0);
    const decisionSpans = bodies.flatMap(b => b.body.resourceSpans?.[0].scopeSpans[0].spans ?? []).filter(s => s.name === 'pi.decision.review');
    const decisionLogs = bodies.flatMap(b => b.body.resourceLogs?.[0].scopeLogs[0].logRecords ?? []).filter(r => r.body.stringValue === 'pi.decision.review');
    assert.equal(decisionSpans.length, 1);
    assert.equal(decisionLogs.length, 1);
    assert.equal(decisionSpans[0].spanId, decisionLogs[0].spanId);
    assert.equal(decisionSpans[0].traceId, decisionLogs[0].traceId);
    assert(bodies.some(b => b.body.resourceMetrics?.[0].scopeMetrics[0].metrics.some(m => m.name === 'pi.decision.request.count')));
    assert(bodies.some(b => b.url.endsWith('/v1/metrics')));
    assert(bodies.some(b => b.url.endsWith('/v1/traces')));
    assert(!JSON.stringify(bodies).includes('PRIVATE'));
    assert(!JSON.stringify(bodies).includes('TEST_KEY'));
    assert(bodies.some(b => b.body.resourceMetrics?.[0].scopeMetrics[0].metrics.some(m => m.name === 'pi.context.tokens')));
    assert(bodies.some(b => b.url.endsWith('/v1/logs')));
    const records = bodies.flatMap(b => {
      if (b.body.resourceMetrics) return b.body.resourceMetrics[0].scopeMetrics[0].metrics.flatMap(m => (m.sum ?? m.gauge).dataPoints);
      if (b.body.resourceSpans) return b.body.resourceSpans[0].scopeSpans[0].spans;
      return b.body.resourceLogs[0].scopeLogs[0].logRecords;
    });
    assert(records.every(r => r.attributes.some(a => a.key === 'conversation' && a.value.stringValue === 'main')));
    assert(records.every(r => r.attributes.some(a => a.key === 'execution_source' && a.value.stringValue === (source === 'git_cc' ? 'git_cc' : 'pi'))));
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.PI_NEW_RELIC_API_KEY; else process.env.PI_NEW_RELIC_API_KEY = savedKey;
    if (savedEnable === undefined) delete process.env.PI_NEW_RELIC_ENABLE; else process.env.PI_NEW_RELIC_ENABLE = savedEnable;
    if (savedSource === undefined) delete process.env.PI_EXECUTION_SOURCE; else process.env.PI_EXECUTION_SOURCE = savedSource;
  }
});
}
