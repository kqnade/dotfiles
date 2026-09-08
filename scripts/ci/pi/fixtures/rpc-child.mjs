import { createInterface } from 'node:readline';

let model = { provider: 'openai-codex', id: 'gpt-5.6-sol' };
let thinkingLevel = 'medium';
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
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
  } else if (request.type === 'prompt') {
    process.stderr.write('unexpected prompt\n');
    process.exit(9);
  }
  emit({ type: 'response', id: request.id, command: request.type, success: true, data });
}
