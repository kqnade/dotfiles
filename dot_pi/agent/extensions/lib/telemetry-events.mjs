import { randomBytes } from 'node:crypto';

const id = size => randomBytes(size).toString('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function createCollector({ addMetric, addSpan, now = Date.now }) {
  let base = {}, trace = id(16), turn, modelStart;
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
  function handle(event, metadata = {}) {
    base = { ...base, ...metadata };
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
