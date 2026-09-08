import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RpcClient } from '../../../dot_pi/agent/runtime/rpc.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));

test('a substituted model prevents prompting', async () => {
  const client = new RpcClient({
    command: process.execPath,
    args: [fixture],
    env: { ...process.env, RPC_SUBSTITUTE: 'yes' },
  });
  try {
    await assert.rejects(client.initialize('astra'), /model mismatch/);
    await assert.rejects(client.run('Reply OK.'), /not verified/);
  } finally {
    await client.close();
  }
});

test('run waits for the completed assistant response and preserves Unicode separators', async () => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  try {
    await client.initialize('luna');
    assert.deepEqual(await client.run('Reply OK.'), { text: 'OK\u2028verified', model: 'gpt-5.6-luna' });
  } finally {
    await client.close();
  }
});

test('run rejects concurrent runs', async () => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  try {
    await client.initialize('luna');
    const running = client.run('Reply OK.');
    await assert.rejects(client.run('Second call.'), /already running/);
    assert.deepEqual(await running, { text: 'OK\u2028verified', model: 'gpt-5.6-luna' });
  } finally {
    await client.close();
  }
});

test('abort cancels a prompt accepted by the child', async () => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  try {
    await client.initialize('luna');
    const accepted = new Promise(resolve => client.on('event', event => { if (event.type === 'agent_start') resolve(); }));
    const running = client.run('Reply slowly');
    const runningError = assert.rejects(running, /RPC task aborted|aborted/i);
    await accepted;
    const abortResult = await client.abort();
    assert.equal(abortResult, undefined);
    await runningError;
    assert.deepEqual(await client.run('Reply OK.'), { text: 'OK\u2028verified', model: 'gpt-5.6-luna' });
  } finally {
    await client.close();
  }
});

test('abort fences a run awaiting state verification before its prompt', async () => {
  const client = new RpcClient({command:process.execPath, args:[fixture], env:{...process.env, RPC_DELAY_STATE:'yes'}});
  try {
    await client.initialize('luna');
    let prompts = 0;
    client.on('event', event => { if (event.type === 'agent_start') prompts += 1; });
    const running = assert.rejects(client.run('Reply slowly'), /aborted before prompt/);
    const stopping = client.abort();
    await assert.rejects(client.run('Do not send'), /abort is in progress/);
    await stopping;
    await running;
    assert.equal(prompts, 0);
  } finally { await client.close(); }
});

test('abort after a completed run returns success and keeps future runs usable', async () => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  try {
    await client.initialize('luna');
    assert.deepEqual(await client.run('Reply OK.'), { text: 'OK\u2028verified', model: 'gpt-5.6-luna' });

    const abortResult = await client.abort();
    assert.equal(abortResult, undefined);

    assert.deepEqual(await client.run('Reply OK.'), { text: 'OK\u2028verified', model: 'gpt-5.6-luna' });
  } finally {
    await client.close();
  }
});
