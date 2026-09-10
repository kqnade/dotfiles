import { test } from 'node:test';
import assert from 'node:assert/strict';
import extension from '../../dot_pi/agent/extensions/new-relic.ts';

test('Pi hooks deliver metadata through both New Relic APIs', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.PI_NEW_RELIC_API_KEY;
  const savedEnable = process.env.PI_NEW_RELIC_ENABLE;
  const bodies = [], handlers = new Map();
  process.env.PI_NEW_RELIC_API_KEY = 'TEST_KEY';
  process.env.PI_NEW_RELIC_ENABLE = '1';
  globalThis.fetch = async (url, options) => {
    bodies.push({ url, body: JSON.parse(options.body) });
    return { status: 202, json: async () => ({}) };
  };
  try {
    extension({ on: (name, handler) => handlers.set(name, handler), registerCommand() {}, getThinkingLevel: () => 'high' }, { conversation: 'btw' });
    const ctx = { cwd: '/tmp', mode: 'print', model: { provider: 'openai-codex', id: 'test' }, getContextUsage: () => ({ tokens: 10, contextWindow: 100, percent: 10 }) };
    for (const type of ['session_start', 'agent_start', 'turn_start']) await handlers.get(type)({ type }, ctx);
    await handlers.get('input')({ type: 'input', text: 'PRIVATE_PROMPT' }, ctx);
    await handlers.get('message_end')({ type: 'message_end', message: { role: 'assistant', provider: 'openai-codex', model: 'test', content: 'PRIVATE_OUTPUT', usage: { input: 8, output: 2, totalTokens: 10 } } }, ctx);
    for (const type of ['turn_end', 'agent_end', 'session_shutdown']) await handlers.get(type)({ type }, ctx);
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
    assert(records.every(r => r.attributes.some(a => a.key === 'conversation' && a.value.stringValue === 'btw')));
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.PI_NEW_RELIC_API_KEY; else process.env.PI_NEW_RELIC_API_KEY = savedKey;
    if (savedEnable === undefined) delete process.env.PI_NEW_RELIC_ENABLE; else process.env.PI_NEW_RELIC_ENABLE = savedEnable;
  }
});
