import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollector } from '../../dot_pi/agent/extensions/lib/telemetry-events.mjs';

test('a model turn exports usage and timing without message contents', () => {
  const metrics = [], spans = [];
  let now = 1000;
  const c = createCollector({ addMetric: m => metrics.push(m), addSpan: s => spans.push(s), now: () => now });
  c.handle({ type: 'turn_start', turnIndex: 0 }, { provider: 'openai-codex', model: 'test' });
  now = 2000;
  c.handle({ type: 'message_end', message: { role: 'assistant', content: [{text: 'PRIVATE'}], usage: { input: 100, output: 20, reasoning: 5, cacheRead: 50, cacheWrite: 0, totalTokens: 170 }, stopReason: 'stop' } });
  now = 3000;
  c.handle({ type: 'turn_end', turnIndex: 0 });
  assert.equal(metrics.find(m => m.name === 'pi.token.usage' && m.attributes.type === 'reasoning').value, 5);
  assert.equal(metrics.find(m => m.name === 'pi.turn.tokens').value, 170);
  assert.equal(metrics.find(m => m.name === 'pi.turn.duration').value, 2000);
  assert.equal(metrics.find(m => m.name === 'pi.token.rate' && m.attributes.type === 'output').value, 20);
  assert(!JSON.stringify({metrics, spans}).includes('PRIVATE'));
  assert(spans.some(s => s.attributes.name === 'pi.turn'));
  const response = spans.find(s => s.attributes.name === 'pi.event.message_end');
  assert.equal(response.attributes.input_token_count, 100);
  assert.equal(response.attributes.reasoning_token_count, 5);
});

test('successful edits and skill reads are counted while errors expose no payload', () => {
  const metrics = [], spans = [];
  const c = createCollector({ addMetric: m => metrics.push(m), addSpan: s => spans.push(s) });
  c.handle({ type: 'tool_execution_start', toolCallId: '1', toolName: 'edit', args: { path: 'secret', edits: [{ oldText: '古', newText: '新規' }] } });
  c.handle({ type: 'tool_execution_end', toolCallId: '1', toolName: 'edit', isError: false, result: { content: 'SECRET' } });
  c.handle({ type: 'tool_execution_start', toolCallId: '2', toolName: 'write', args: { content: 'SECRET' } });
  c.handle({ type: 'tool_execution_end', toolCallId: '2', toolName: 'write', isError: true });
  c.handle({ type: 'tool_execution_start', toolCallId: '3', toolName: 'read', args: {} }, {}, { skillName: 'example' });
  c.handle({ type: 'tool_execution_end', toolCallId: '3', toolName: 'read', isError: false });
  assert.equal(metrics.find(m => m.name === 'pi.edit.bytes' && m.attributes.type === 'added').value, 6);
  assert.equal(metrics.filter(m => m.name === 'pi.edit.bytes').length, 2);
  assert.equal(metrics.find(m => m.name === 'pi.skill.count').attributes.skill, 'example');
  assert(!JSON.stringify({metrics, spans}).includes('SECRET'));
  assert(!JSON.stringify({metrics, spans}).includes('secret'));
});

test('lifecycle events form a trace and optional reasoning stays absent', () => {
  const metrics = [], spans = [];
  let now = 1000;
  const c = createCollector({ addMetric: m => metrics.push(m), addSpan: s => spans.push(s), now: () => now });
  for (const type of ['session_start', 'agent_start', 'turn_start']) c.handle({ type });
  c.handle({ type: 'after_provider_response', status: 429, headers: { authorization: 'SECRET' } });
  c.handle({ type: 'message_end', message: { role: 'assistant', usage: { input: 10, output: 2, totalTokens: 12 }, stopReason: 'error', errorMessage: 'SECRET' } });
  now = 1500;
  for (const type of ['turn_end', 'agent_end', 'session_shutdown']) c.handle({ type });
  assert(spans.some(s => s.attributes.name === 'pi.agent'));
  assert.equal(new Set(spans.map(s => s['trace.id'])).size, 1);
  assert.equal(metrics.find(m => m.name === 'pi.provider.response.count').attributes.status, 429);
  assert(!metrics.some(m => m.name === 'pi.token.usage' && m.attributes.type === 'reasoning'));
  assert(!JSON.stringify({metrics, spans}).includes('SECRET'));
});

test('Decision API observations produce correlated request metrics and spans without raw fields', () => {
  const metrics = [], spans = [];
  let now = 1000;
  const c = createCollector({ addMetric: m => metrics.push(m), addSpan: s => spans.push(s), now: () => now });
  c.handle({ type: 'session_start' }, { provider: 'openai-codex', model: 'parent-model', conversation: 'main' });
  c.handle({ type: 'agent_start' });
  c.handle({ type: 'turn_start' });
  now = 1100;
  c.handle({ type: 'decision_review', startedAt: 1020, durationMs: 80, requestDurationMs: 30,
    requested: true, status: 200, risk: 'low', source: 'child', tool: 'bash', keyCacheHit: true,
    requestBytes: 512, responseBytes: 128, usage: { input: 10, output: 2, total: 12, cacheRead: 0, reasoning: 1, secret: 'PRIVATE' },
    body: 'PRIVATE', headers: { authorization: 'PRIVATE' }, command: 'PRIVATE', cwd: 'PRIVATE', errorMessage: 'PRIVATE' });
  now = 1200;
  c.handle({ type: 'turn_end' });
  const decision = spans.find(s => s.attributes.name === 'pi.decision.review');
  assert(decision);
  assert.equal(decision.timestamp, 1020);
  assert.equal(decision.attributes['duration.ms'], 80);
  assert.equal(decision.attributes.decision_model, 'gpt-6-luna');
  assert.equal(decision.attributes.decision_source, 'child');
  assert.equal(decision.attributes.decision_outcome, 'allow');
  assert.equal(decision.attributes.http_status, 200);
  assert.equal(decision.attributes.input_token_count, 10);
  assert.equal(decision.attributes['parent.id'], spans.find(s => s.attributes.name === 'pi.turn').id);
  assert.equal(metrics.find(m => m.name === 'pi.decision.request.count').value, 1);
  assert.equal(metrics.find(m => m.name === 'pi.decision.request.duration').value, 30);
  assert.equal(metrics.find(m => m.name === 'pi.decision.token.usage' && m.attributes.type === 'reasoning').value, 1);
  assert(!metrics.some(m => m.name === 'pi.token.usage'));
  assert.equal(new Set(spans.map(s => s['trace.id'])).size, 1);
  assert.doesNotMatch(JSON.stringify({ metrics, spans }), /PRIVATE/);
});

test('Decision API errors and non-HTTP denials remain distinct and sanitized', () => {
  const metrics = [], spans = [];
  const c = createCollector({ addMetric: m => metrics.push(m), addSpan: s => spans.push(s) });
  c.handle({ type: 'decision_review', startedAt: Date.now(), durationMs: 5, requested: false,
    risk: 'high', error: 'credentials', tool: 'bash', source: 'parent' });
  c.handle({ type: 'decision_review', startedAt: Date.now(), durationMs: 5, requested: true,
    risk: 'high', error: 'PRIVATE_ERROR', tool: 'PRIVATE_TOOL', source: 'PRIVATE_SOURCE', status: 'PRIVATE_STATUS',
    requestBytes: -1, usage: { input: 'PRIVATE_TOKENS', output: -1, reasoning: Infinity } });
  assert.equal(metrics.filter(m => m.name === 'pi.decision.review.count').length, 2);
  assert.equal(metrics.filter(m => m.name === 'pi.decision.request.count').length, 1);
  assert.equal(spans[0].attributes.decision_outcome, 'error');
  assert.equal(spans[0].attributes.error_type, 'credentials');
  assert.equal(spans[1].attributes.error_type, 'unknown');
  assert(!metrics.some(m => m.name === 'pi.decision.token.usage'));
  assert.doesNotMatch(JSON.stringify({ metrics, spans }), /PRIVATE/);
});

test('each stream event is recorded and tool usage remains separate from model usage', () => {
  const metrics = [], spans = [];
  const c = createCollector({ addMetric: m => metrics.push(m), addSpan: s => spans.push(s) });
  for (let i = 0; i < 100; i++) c.handle({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'SECRET' } });
  c.handle({ type: 'tool_result', toolName: 'subagent', usage: { input: 40, output: 10 } });
  c.handle({ type: 'turn_end' });
  assert.equal(metrics.find(m => m.name === 'pi.event.count' && m.attributes.event === 'message_update').value, 1);
  assert.equal(metrics.filter(m => m.attributes.event === 'message_update').length, 100);
  assert.equal(spans.filter(s => s.attributes.name === 'pi.event.message_update').length, 100);
  assert.equal(spans[0].attributes['stream.bytes'], 6);
  assert.equal(metrics.find(m => m.name === 'pi.tool.token.usage' && m.attributes.type === 'input').value, 40);
  assert(!JSON.stringify({metrics, spans}).includes('SECRET'));
});
