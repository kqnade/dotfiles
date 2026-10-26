import { randomBytes } from 'node:crypto';

const id = size => randomBytes(size).toString('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const label = value => typeof value === 'string' && value.length <= 160 && /^[a-zA-Z0-9_.:/+-]+$/.test(value) ? value : 'unknown';
const tokenFields = { inputTokens: 'input', outputTokens: 'output', cacheReadTokens: 'cache_read', cacheWriteTokens: 'cache_write', reasoningTokens: 'reasoning' };

export function createCollector({ addMetric, addSpan, now = Date.now }) {
  let sessions = new WeakMap();
  function state(session) {
    if (!sessions.has(session)) sessions.set(session, { trace: id(16), attempts: new Map(), tools: new Map() });
    return sessions.get(session);
  }
  function metadata(session) {
    const config = session.requestHeader()?.config;
    return { provider: label(config?.provider), model: label(config?.model), profile: 'personal' };
  }
  function metric(name, value, attributes) {
    if (finite(value)) addMetric({ name, value, type: name.endsWith('.count') || name.endsWith('.usage') ? 'count' : 'gauge', timestamp: now(), 'interval.ms': 1, attributes });
  }
  function finish(s, name, start, attributes, end = now()) {
    const duration = Math.max(0, end - start.time);
    metric(name + '.count', 1, attributes);
    metric(name + '.duration', duration, attributes);
    addSpan({ id: start.id, 'trace.id': s.trace, timestamp: start.time,
      attributes: { ...attributes, name, 'duration.ms': duration, ...(start.parent ? { 'parent.id': start.parent } : {}) } });
  }
  function stream({ agent, frame }) {
    const s = state(agent.session), key = frame.attemptId;
    if (frame.type === 'start') {
      s.attempts.set(key, { id: id(8), time: now(), attributes: metadata(agent.session), usage: {} });
      return;
    }
    const start = s.attempts.get(key);
    if (!start) return;
    if (frame.type === 'chunk' && frame.chunk.type === 'usage') {
      start.usage = {};
      for (const field of Object.keys(tokenFields)) if (finite(frame.chunk.usage[field])) start.usage[field] = frame.chunk.usage[field];
    }
    if (frame.type === 'chunk' && frame.chunk.type === 'finish') {
      const reason = frame.chunk.reason.kind;
      start.reason = ['stop', 'tool-calls', 'max-tokens', 'aborted', 'error'].includes(reason) ? reason : 'unknown';
    }
    if (frame.type === 'end') {
      s.attempts.delete(key);
      if (s.lastMessage?.seq === frame.outcome.seq && s.lastMessage?.interrupted) start.reason = 'aborted';
      const success = frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message' && !['error', 'aborted'].includes(start.reason);
      const attributes = { ...start.attributes, success, stop_reason: start.reason ?? 'unknown', outcome: frame.outcome.kind };
      for (const [field, type] of Object.entries(tokenFields)) metric('dsh.token.usage', start.usage[field], { ...attributes, type });
      const { inputTokens, cacheReadTokens } = start.usage;
      const cacheTotal = inputTokens + cacheReadTokens;
      if (Number.isSafeInteger(inputTokens) && Number.isSafeInteger(cacheReadTokens)
        && Number.isSafeInteger(cacheTotal) && cacheTotal > 0) {
        metric('dsh.cache.token.usage', cacheReadTokens, { ...attributes, type: 'cache_read' });
        metric('dsh.cache.token.usage', inputTokens, { ...attributes, type: 'input' });
      }
      finish(s, 'dsh.request', start, attributes);
    }
  }
  function event(session, event) {
    const { type, data, time } = event;
    if (type === 'assistant/message') {
      const s = sessions.get(session);
      if (s?.attempts.size) s.lastMessage = { seq: event.seq, interrupted: data.interrupted === true };
      return;
    }
    const nativeStart = type === 'tool/call', nestedStart = type === 'tool/ptc-dispatch-start';
    const nativeEnd = type === 'tool/result', nestedEnd = type === 'tool/ptc-dispatch';
    if ((!nativeStart && !nestedStart && !nativeEnd && !nestedEnd) || !finite(time)) return;
    const s = state(session);
    const key = nativeStart ? data.callId : nativeEnd ? data.message.toolCallId : data.subCallId;
    if (nativeStart || nestedStart) {
      s.tools.set(key, { id: id(8), time, parent: nestedStart ? s.tools.get(data.parentCallId)?.id : undefined,
        attributes: { ...metadata(session), tool: label(data.name), execution: nestedStart ? 'nested' : 'native' } });
      return;
    }
    const start = s.tools.get(key);
    if (!start) return;
    s.tools.delete(key);
    finish(s, 'dsh.tool', start, { ...start.attributes, success: !(nativeEnd ? data.message.isError : data.isError) }, time);
  }
  return { stream, event, dispose(session) { sessions.delete(session); }, clear() { sessions = new WeakMap(); } };
}
