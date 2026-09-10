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
