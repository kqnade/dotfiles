import { createInterface } from 'node:readline';

let model = { provider: 'openai-codex', id: 'gpt-5.6-sol' };
let thinkingLevel = 'medium';
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

let promptTimer;
let stateRequests = 0;

const emitAssistant = ({ text, stopReason }) => {
  const message = {
    role: 'assistant',
    content: text === null ? [] : [{ type: 'text', text }],
    stopReason,
    model: model.id,
  };
  emit({ type: 'message_end', message });
  emit({ type: 'agent_end', messages: [message] });
};

const clearPrompt = () => {
  if (promptTimer) {
    clearTimeout(promptTimer);
    promptTimer = undefined;
  }
};

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  let data;

  if (request.type === 'get_available_models') {
    data = { models: ['gpt-5.6-sol', 'gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.3-codex-spark'].map(id => ({ provider: 'openai-codex', id })) };
  } else if (request.type === 'set_model') {
    model = { provider: request.provider, id: request.modelId };
    data = model;
  } else if (request.type === 'get_available_thinking_levels') {
    data = { levels: ['medium', 'max'] };
  } else if (request.type === 'set_thinking_level') {
    thinkingLevel = request.level;
  } else if (request.type === 'get_state') {
    data = { model: process.env.RPC_SUBSTITUTE ? { ...model, id: 'gpt-5.6-sol' } : model, thinkingLevel };
    stateRequests += 1;
    if (process.env.RPC_DELAY_STATE && stateRequests > 1) {
      setTimeout(() => emit({type:'response', id:request.id, command:request.type, success:true, data}), 80);
      continue;
    }
  } else if (request.type === 'prompt') {
    if (process.env.RPC_SUBSTITUTE) process.exit(9);

    const delay = request.message === 'Reply slowly' ? 250 : 25;
    clearPrompt();
    emit({ type: 'agent_start' });
    const messageText = request.message === 'Reply slowly' ? 'slow\u2028verified' : 'OK\u2028verified';

    promptTimer = setTimeout(() => {
      promptTimer = undefined;
      emitAssistant({ text: messageText, stopReason: 'stop' });
    }, delay);

    data = { ok: true };
  } else if (request.type === 'clear_queue') {
    data = undefined;
  } else if (request.type === 'abort') {
    if (promptTimer) emitAssistant({ text: '', stopReason: 'aborted' });
    clearPrompt();
    data = undefined;
  }

  emit({ type: 'response', id: request.id, command: request.type, success: true, data });
}
