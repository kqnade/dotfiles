import { randomBytes } from 'node:crypto';
import { estimateApiCostUsd } from './cost.mjs';

const id = size => randomBytes(size).toString('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const label = value => typeof value === 'string' && value.length <= 160 && /^[a-zA-Z0-9_.:/+-]+$/.test(value) ? value : 'unknown';
const tokenFields = { inputTokens: 'input', outputTokens: 'output', cacheReadTokens: 'cache_read', cacheWriteTokens: 'cache_write', reasoningTokens: 'reasoning' };

function errorClass(failure) {
  const codes = { AUTH: 'authentication', RATE_LIMIT: 'rate_limit', SERVER: 'server', INVALID_REQUEST: 'client', TRANSPORT: 'network' };
  if (Object.hasOwn(codes, failure?.code)) return codes[failure.code];
  if (failure?.status === 429) return 'rate_limit';
  if ([401, 403].includes(failure?.status)) return 'authentication';
  if (failure?.status >= 500 && failure.status <= 599) return 'server';
  if (failure?.status >= 400 && failure.status <= 499) return 'client';
  if (['ETIMEDOUT', 'TIMEOUT'].includes(failure?.code)) return 'timeout';
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'NETWORK_ERROR'].includes(failure?.code)) return 'network';
  return 'unknown';
}

export function createCollector({ addMetric, addSpan, now = Date.now, getRates = () => null, profile = 'personal' }) {
  let sessions = new WeakMap();
  let loaded = 0, active = 0;
  const instance = id(8);
  const subagents = new Map();
  function subagentStart(info) {
    if (subagents.has(info.runId)) return;
    const attributes = { profile, backend: ['spawn', 'fork', 'codex', 'claude-code'].includes(info.provider) ? info.provider : 'other', local: info.local === true };
    subagents.set(info.runId, { id: id(8), trace: id(16), time: now(), attributes });
    metric('dsh.subagent.started.count', 1, attributes);
  }
  function subagentEnd(info) {
    const start = subagents.get(info.runId);
    if (!start) return;
    subagents.delete(info.runId);
    const reason = ['completed', 'aborted', 'max-tokens', 'refusal', 'error'].includes(info.stopReason) ? info.stopReason : 'unknown';
    const attributes = { ...start.attributes, stop_reason: reason, success: reason === 'completed' };
    if (!start.attributes.local) metric('dsh.subagent.usage.unavailable.count', 1, attributes);
    finish(start, 'dsh.subagent', start, attributes);
  }
  function sample() {
    const attributes = { profile, instance };
    metric('dsh.session.loaded', loaded, attributes);
    metric('dsh.session.active', active, attributes);
  }
  function created({ agent, source }) {
    const s = state(agent.session);
    if (s.attached) return;
    s.attached = true;
    s.time = now();
    loaded++;
    metric('dsh.session.count', 1, { ...sessionMetadata(agent.session),
      source: ['startup', 'resume', 'clear', 'compact'].includes(source) ? source : 'unknown' });
  }
  function status({ agent, status }) {
    const s = state(agent.session);
    const running = status === 'running';
    if (s.running === running) return;
    active += running ? 1 : -1;
    s.running = running;
  }
  function dispose(session) {
    const s = sessions.get(session);
    if (!s) return;
    if (s.attached) {
      loaded--;
      metric('dsh.session.duration', Math.max(0, now() - s.time), sessionMetadata(session));
    }
    if (s.running) active--;
    sessions.delete(session);
  }
  async function requestError({ agent, failure }, next) {
    metric('dsh.request.error.count', 1, { ...metadata(agent.session), error_class: errorClass(failure) });
    return next();
  }
  function state(session) {
    if (!sessions.has(session)) sessions.set(session, { trace: id(16), attempts: new Map(), tools: new Map(), turns: new Map(), running: false, seq: -1 });
    return sessions.get(session);
  }
  function sessionMetadata(session) {
    return { profile, agent_role: session.header?.origin === 'subagent' ? 'subagent' : 'root' };
  }
  function metadata(session) {
    const config = session.requestHeader()?.config;
    return { ...sessionMetadata(session), provider: label(config?.provider), model: label(config?.model) };
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
      const turn = s.turns.get(frame.turn);
      if (turn && !turn.hasRequest) { turn.attributes = metadata(agent.session); turn.hasRequest = true; }
      s.attempts.set(key, { id: id(8), time: now(), attributes: metadata(agent.session), usage: {} });
      return;
    }
    const start = s.attempts.get(key);
    if (!start) return;
    if (frame.type === 'chunk' && start.firstResponse === undefined) {
      const chunk = frame.chunk;
      if ((['text-delta', 'reasoning-delta'].includes(chunk.type) && typeof chunk.text === 'string' && chunk.text.length > 0)
        || chunk.type === 'tool-call-delta') start.firstResponse = Math.max(0, now() - start.time);
    }
    if (frame.type === 'chunk' && frame.chunk.type === 'usage') {
      start.usage = {};
      start.costUsage = {};
      for (const field of Object.keys(tokenFields)) {
        if (Object.hasOwn(frame.chunk.usage, field)) start.costUsage[field] = finite(frame.chunk.usage[field]) ? frame.chunk.usage[field] : NaN;
      }
      for (const field of Object.keys(tokenFields)) if (finite(frame.chunk.usage[field])) start.usage[field] = frame.chunk.usage[field];
    }
    if (frame.type === 'chunk' && frame.chunk.type === 'finish') {
      const reason = frame.chunk.reason.kind;
      if (reason === 'error') start.errorClass = errorClass(frame.chunk.reason.failure);
      start.reason = ['stop', 'tool-calls', 'max-tokens', 'aborted', 'error'].includes(reason) ? reason : 'unknown';
    }
    if (frame.type === 'end') {
      s.attempts.delete(key);
      if (s.lastMessage?.seq === frame.outcome.seq && s.lastMessage?.interrupted) start.reason = 'aborted';
      const success = frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message' && !['error', 'aborted'].includes(start.reason);
      const attributes = { ...start.attributes, success, stop_reason: start.reason ?? 'unknown', outcome: frame.outcome.kind, ...(start.errorClass ? { error_class: start.errorClass } : {}) };
      for (const [field, type] of Object.entries(tokenFields)) metric('dsh.token.usage', start.usage[field], { ...attributes, type });
      const { inputTokens, cacheReadTokens } = start.usage;
      const cacheTotal = inputTokens + cacheReadTokens;
      if (Number.isSafeInteger(inputTokens) && Number.isSafeInteger(cacheReadTokens)
        && Number.isSafeInteger(cacheTotal) && cacheTotal > 0) {
        metric('dsh.cache.token.usage', cacheReadTokens, { ...attributes, type: 'cache_read' });
        metric('dsh.cache.token.usage', inputTokens, { ...attributes, type: 'input' });
      }
      const cost = estimateApiCostUsd(start.costUsage, getRates(attributes.provider, attributes.model, start.costUsage ?? {}));
      metric('dsh.cost.coverage.count', 1, { ...attributes, status: cost === null ? 'unavailable' : 'estimated' });
      if (cost !== null) metric('dsh.cost.estimated.usage', cost, { ...attributes, currency: 'USD', pricing_source: 'pi_ai_catalog' });
      metric('dsh.request.first_response.duration', start.firstResponse, attributes);
      if (start.reason === 'aborted') metric('dsh.request.interrupted.count', 1, attributes);
      finish(s, 'dsh.request', start, attributes);
    }
  }
  function event(session, event) {
    const { type, data, time } = event;
    const current = state(session);
    if (Number.isSafeInteger(event.seq)) {
      if (event.seq <= current.seq) return;
      current.seq = event.seq;
    }
    if (type === 'turn/start' && finite(time)) {
      if (!current.turns.has(data.turn)) current.turns.set(data.turn, { id: id(8), time, attributes: { ...sessionMetadata(session), provider: 'unknown', model: 'unknown' } });
      return;
    }
    if (type === 'turn/end' && finite(time)) {
      const start = current.turns.get(data.turn);
      if (!start) return;
      current.turns.delete(data.turn);
      const reason = ['completed', 'aborted', 'blocked', 'error', 'max-tokens'].includes(data.reason?.kind) ? data.reason.kind : 'unknown';
      const attributes = { ...start.attributes, stop_reason: reason, success: reason === 'completed' };
      if (reason === 'error') attributes.error_class = errorClass(data.reason.error);
      if (reason === 'aborted') metric('dsh.turn.interrupted.count', 1, attributes);
      finish(current, 'dsh.turn', start, attributes, time);
      return;
    }
    if (type === 'llm/retry') {
      const attributes = { ...metadata(session), error_class: errorClass(data.failure) };
      metric('dsh.request.retry.count', 1, attributes);
      metric('dsh.request.retry.delay', data.delayMs, attributes);
      return;
    }
    if (type === 'llm/retry-started') {
      metric('dsh.request.retry.started.count', 1, metadata(session));
      return;
    }
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
  return { stream, event, created, status, requestError, subagentStart, subagentEnd, sample, dispose,
    clear() { sessions = new WeakMap(); subagents.clear(); loaded = active = 0; sample(); } };
}
