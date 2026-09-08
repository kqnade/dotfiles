import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
for (const flag of ['--no-session', '--no-builtin-tools', '--no-extensions', '--no-skills', '--no-context-files']) {
  if (!args.includes(flag)) throw new Error(`Missing isolation flag: ${flag}`);
}
let model;
let effort;
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.type === 'set_model') model = { provider: request.provider, id: request.modelId };
  if (request.type === 'set_thinking_level') effort = request.level;
  let data;
  if (request.type === 'get_available_models') data = { models: [{ provider: 'openai-codex', id: 'gpt-5.6-sol' }] };
  if (request.type === 'get_available_thinking_levels') data = { levels: ['medium'] };
  if (request.type === 'get_state') data = { model, thinkingLevel: effort };
  send({ type: 'response', id: request.id, command: request.type, success: true,
    data });
  if (request.type === 'prompt') {
    writeFileSync('request.json', JSON.stringify({ pid: process.pid, model: model.id, effort, prompt: request.message }));
    if (process.env.PI_COMMIT_TEST_DELAY) await new Promise(resolve => setTimeout(resolve, 600));
    const message = { role: 'assistant', model: model.id, stopReason: 'stop',
      content: [{ type: 'text', text: '✨ feat: add managed startup' }] };
    send({ type: 'message_end', message });
    send({ type: 'agent_end', messages: [message] });
  }
}
