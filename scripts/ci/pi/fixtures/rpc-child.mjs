import { createInterface } from 'node:readline';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect } from '../../../../dot_pi/agent/runtime/ipc.mjs';

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
    if (process.env.RPC_REQUIRE_JOURNAL) {
      const directory = process.env.RPC_REQUIRE_JOURNAL;
      const markers = await Promise.all((await readdir(directory))
        .filter(name => name.endsWith('.json'))
        .map(async name => JSON.parse(await readFile(join(directory, name), 'utf8'))));
      const job = markers.flatMap(marker => Object.values(marker.jobs)).find(job => job.pid === process.pid);
      if (job?.state !== 'running') process.exit(12);
    }
    if (process.env.RPC_SUBSTITUTE) process.exit(9);

    if (['Delegate a broker write to Luna.', 'Write through broker.'].includes(request.message)) {
      const client = await connect({
        socketPath: process.env.PI_BROKER_SOCKET,
        agentId: process.env.PI_AGENT_ID,
        token: process.env.PI_AGENT_TOKEN,
      });
      try {
        const identity = await client.call('permit');
        if (identity.role !== process.env.PI_AGENT_ROLE) throw new Error('broker identity mismatch');
        if (request.message === 'Delegate a broker write to Luna.') {
          const [child] = await client.call('delegate', { tasks: [{ role: 'luna', task: 'Write through broker.', paths: ['code.txt'] }] });
          emitAssistant({ text: child.result.text, stopReason: 'stop' });
        } else {
          const original = await client.call('read', { path: 'code.txt' });
          await client.call('write', { path: 'code.txt', text: 'written by Luna', expectedHash: original.hash });
          emitAssistant({ text: 'Luna wrote through the broker', stopReason: 'stop' });
        }
      } finally {
        await client.close();
      }
      emit({ type: 'response', id: request.id, command: request.type, success: true });
      continue;
    }

    const delay = Number(process.env.RPC_PROMPT_DELAY ?? (request.message === 'Reply slowly' ? 250 : 25));
    const delayedWrite = request.message === 'Reply slowly' ? process.env.RPC_WRITE_AFTER_DELAY : undefined;
    clearPrompt();
    emit({ type: 'agent_start' });
    const messageText = request.message === 'Reply slowly' ? 'slow\u2028verified' : 'OK\u2028verified';

    promptTimer = setTimeout(async () => {
      promptTimer = undefined;
      if (delayedWrite) {
        const client = await connect({
          socketPath: process.env.PI_BROKER_SOCKET,
          agentId: process.env.PI_AGENT_ID,
          token: process.env.PI_AGENT_TOKEN,
        });
        let failed = false;
        try {
          const original = await client.call('read', { path: delayedWrite });
          await client.call('write', { path: delayedWrite, text: 'late write', expectedHash: original.hash });
        } catch {
          failed = true;
        } finally {
          await client.close();
        }
        if (failed) {
          emitAssistant({ text: '', stopReason: 'error' });
          return;
        }
      }
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
