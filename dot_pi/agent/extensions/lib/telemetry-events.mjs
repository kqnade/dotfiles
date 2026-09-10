import { randomBytes } from 'node:crypto';

const id = size => randomBytes(size).toString('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const bytes = text => typeof text === 'string' ? Buffer.byteLength(text) : 0;

export function createCollector({ addMetric, addSpan, now = Date.now }) {
  let base = {}, trace = id(16), turn, modelStart;
  const tools = new Map();
  const metric = (name, value, attributes = {}) => {
    if (finite(value)) addMetric({ name, type: 'gauge', value, timestamp: now(), attributes: { ...base, ...attributes } });
  };
  const start = () => ({ id: id(8), time: now(), attributes: { ...base } });
  const end = (name, state, attributes = {}) => {
    if (!state) return;
    const duration = Math.max(0, now() - state.time);
    metric(`${name}.duration`, duration);
    addSpan({ id: state.id, 'trace.id': trace, timestamp: state.time, attributes: { ...state.attributes, ...attributes, name, 'duration.ms': duration } });
  };
  function handle(event, metadata = {}, observation = {}) {
    base = { ...base, ...metadata };
    if (event.type === 'tool_execution_start') {
      const args = event.args ?? {};
      const edits = Array.isArray(args.edits) ? args.edits : [args];
      tools.set(event.toolCallId, { ...start(), tool: event.toolName, skill: observation.skillName,
        added: event.toolName === 'write' ? bytes(args.content) : edits.reduce((n, e) => n + bytes(e.newText), 0),
        removed: event.toolName === 'write' ? observation.previousBytes : edits.reduce((n, e) => n + bytes(e.oldText), 0) });
    }
    if (event.type === 'tool_execution_end') {
      const state = tools.get(event.toolCallId);
      const attributes = { tool: event.toolName, success: !event.isError };
      metric('pi.tool.count', 1, attributes);
      end('pi.tool', state, attributes);
      if (state && !event.isError) {
        if (['edit', 'write'].includes(state.tool)) {
          metric('pi.edit.bytes', state.added, { tool: state.tool, type: 'added' });
          metric('pi.edit.bytes', state.removed, { tool: state.tool, type: 'removed' });
        }
        if (state.skill) metric('pi.skill.count', 1, { skill: state.skill, method: 'read' });
      }
      tools.delete(event.toolCallId);
    }
    if (event.type === 'turn_start') {
      turn = { ...start(), tokens: 0 };
      modelStart = now();
    }
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const usage = event.message.usage ?? {};
      for (const [field, type] of Object.entries({ input: 'input', output: 'output', cacheRead: 'cache_read', cacheWrite: 'cache_write', reasoning: 'reasoning' })) {
        metric('pi.token.usage', usage[field], { type });
      }
      if (turn && finite(usage.totalTokens)) turn.tokens += usage.totalTokens;
      const seconds = (now() - modelStart) / 1000;
      if (seconds > 0) for (const type of ['input', 'output']) metric('pi.token.rate', usage[type] / seconds, { type, denominator: 'model_response_wall_time' });
    }
    if (event.type === 'turn_end') {
      if (turn) metric('pi.turn.tokens', turn.tokens);
      end('pi.turn', turn);
      turn = undefined;
    }
  }
  return { handle };
}
