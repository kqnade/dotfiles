import { randomBytes } from 'node:crypto';

const id = size => randomBytes(size).toString('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const bytes = text => typeof text === 'string' ? Buffer.byteLength(text) : 0;

export function createCollector({ addMetric, addSpan, now = Date.now }) {
  let base = {}, trace = id(16), turn, modelStart, session, agent, message, waiting, providerStart;
  const tools = new Map();
  const metric = (name, value, attributes = {}) => {
    if (finite(value)) addMetric({ name, type: name.endsWith('.count') || name.endsWith('.usage') || name === 'pi.edit.bytes' ? 'count' : 'gauge', value, timestamp: now(), 'interval.ms': 1, attributes: { ...base, ...attributes } });
  };
  const start = () => ({ id: id(8), time: now(), attributes: { ...base } });
  const end = (name, state, attributes = {}) => {
    if (!state) return;
    const duration = Math.max(0, now() - state.time);
    metric(`${name}.duration`, duration, attributes);
    addSpan({ id: state.id, 'trace.id': trace, timestamp: state.time, attributes: { ...state.attributes, ...attributes, name, 'duration.ms': duration } });
  };
  function handle(event, metadata = {}, observation = {}) {
    base = { ...base, ...metadata };
    metric('pi.event.count', 1, { event: event.type });
    const attributes = { ...base, name: `pi.event.${event.type}`, 'duration.ms': 0 };
    const parent = turn ?? agent ?? session;
    if (parent) attributes['parent.id'] = parent.id;
    if (finite(event.turnIndex)) attributes.turn_index = event.turnIndex;
    if (typeof event.toolName === 'string') attributes.tool = event.toolName;
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const usage = event.message.usage ?? {};
      for (const [field, name] of Object.entries({ input: 'input_token_count', output: 'output_token_count', cacheRead: 'cached_token_count', cacheWrite: 'cache_write_token_count', reasoning: 'reasoning_token_count', totalTokens: 'total_token_count' })) {
        if (finite(usage[field])) attributes[name] = usage[field];
      }
    }
    for (const field of ['isError', 'aborted', 'willRetry', 'fromExtension', 'excludeFromContext']) {
      if (typeof event[field] === 'boolean') attributes[field] = event[field];
    }
    if (['manual', 'threshold', 'overflow', 'quit', 'reload', 'new', 'resume', 'fork', 'ui_prompt'].includes(event.reason)) attributes.reason = event.reason;
    if (['interactive', 'rpc', 'extension', 'set', 'cycle', 'restore'].includes(event.source)) attributes.source = event.source;
    const delta = event.assistantMessageEvent;
    if (delta && ['text_delta', 'thinking_delta', 'toolcall_delta'].includes(delta.type)) {
      attributes['stream.event'] = delta.type;
      attributes['stream.bytes'] = bytes(delta.delta);
    }
    addSpan({ id: id(8), 'trace.id': trace, timestamp: now(), attributes });
    if (event.type === 'tool_result') {
      for (const [field, type] of Object.entries({ input: 'input', output: 'output', cacheRead: 'cache_read', cacheWrite: 'cache_write', reasoning: 'reasoning' })) metric('pi.tool.token.usage', event.usage?.[field], { tool: event.toolName, type });
    }
    if (event.type === 'session_start') session = start();
    if (event.type === 'agent_start') agent = start();
    if (event.type === 'input') {
      metric('pi.prompt.bytes', bytes(event.text));
      metric('pi.prompt.images', event.images?.length ?? 0);
      if (observation.skillName) metric('pi.skill.count', 1, { skill: observation.skillName, method: 'command' });
    }
    if (event.type === 'before_agent_start') {
      metric('pi.system_prompt.bytes', bytes(event.systemPrompt));
      metric('pi.skills.available', event.systemPromptOptions?.skills?.length);
      metric('pi.context.files', event.systemPromptOptions?.contextFiles?.length);
    }
    if (event.type === 'before_provider_request') providerStart = now();
    if (event.type === 'after_provider_response') {
      metric('pi.provider.response.count', 1, { status: event.status });
      if (providerStart !== undefined) metric('pi.provider.headers.duration', now() - providerStart);
    }
    if (event.type === 'ui_prompt_start') waiting = start();
    if (event.type === 'ui_prompt_end') { end('pi.ui_wait', waiting); waiting = undefined; }
    if (event.type === 'message_start' && event.message?.role === 'assistant') {
      message = start();
      modelStart = now();
    }
    if (event.type === 'message_update' && message) {
      const type = event.assistantMessageEvent?.type;
      if (['text_delta', 'thinking_delta', 'toolcall_delta'].includes(type) && !message.firstDelta) {
        message.firstDelta = now();
        metric('pi.model.first_delta.duration', now() - modelStart);
      }
    }
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
      end('pi.tool', state, { ...attributes, ...(turn ? { 'parent.id': turn.id } : {}) });
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
      metric('pi.reasoning.available', finite(usage.reasoning) ? 1 : 0);
      for (const [field, type] of Object.entries({ input: 'input', output: 'output', cacheRead: 'cache_read', cacheWrite: 'cache_write', reasoning: 'reasoning' })) {
        metric('pi.token.usage', usage[field], { type });
      }
      if (turn && finite(usage.totalTokens)) turn.tokens += usage.totalTokens;
      for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) metric('pi.cost.usage', usage.cost?.[field], { type: field });
      const seconds = (now() - modelStart) / 1000;
      if (seconds > 0) for (const type of ['input', 'output']) metric('pi.token.rate', usage[type] / seconds, { type, denominator: 'model_response_wall_time' });
      const stopReason = ['stop', 'length', 'toolUse', 'error', 'aborted'].includes(event.message.stopReason) ? event.message.stopReason : 'unknown';
      end('pi.model', message, { stop_reason: stopReason, ...(turn ? { 'parent.id': turn.id } : {}) });
      message = undefined;
    }
    if (event.type === 'turn_end') {
      if (turn) metric('pi.turn.tokens', turn.tokens);
      end('pi.turn', turn, agent ? { 'parent.id': agent.id, tokens: turn?.tokens ?? 0 } : {});
      turn = undefined;
    }
    if (event.type === 'agent_end') { end('pi.agent', agent, session ? { 'parent.id': session.id } : {}); agent = undefined; }
    if (event.type === 'session_shutdown') {
      end('pi.session', session);
      tools.clear();
    }
    if (event.type === 'session_compact') metric('pi.compaction.tokens_before', event.compactionEntry?.tokensBefore);
    for (const [key, value] of Object.entries(observation.measurements ?? {})) metric(`pi.${key}`, value);
  }
  return { handle };
}
