import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { RpcClient } from '../../../dot_pi/agent/runtime/rpc.mjs';
import { stopProcessGroup } from '../../../dot_pi/agent/runtime/ownership.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));

test('close confirms termination of the RPC process and its auxiliary process', async () => {
  const groupFixture = fileURLToPath(new URL('./fixtures/rpc-process-group.mjs', import.meta.url));
  const client = new RpcClient({ command: process.execPath, args: [groupFixture] });
  let auxiliaryPid;
  try {
    const [event] = await once(client, 'event');
    auxiliaryPid = event.pid;
    assert.equal(event.type, 'auxiliary_ready');
    await client.close();
    assert.throws(() => process.kill(auxiliaryPid, 0), { code: 'ESRCH' });
    assert.throws(() => process.kill(-client.process.pid, 0), { code: 'ESRCH' });
  } finally {
    if (auxiliaryPid) {
      try { process.kill(auxiliaryPid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await client.close();
  }
});

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

test('close rejects new RPC requests before writing to the closing stream', async () => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  try {
    await client.initialize('luna');
    const closing = client.close();
    const bytesWritten = client.process.stdin.bytesWritten;
    await assert.rejects(client.request('get_state'), /RPC process is closing/);
    assert.equal(client.process.stdin.bytesWritten, bytesWritten);
    assert.deepEqual(await client.close(), await closing);
  } finally {
    await client.close();
  }
});

test('close preserves failure when process-group termination cannot be inspected', async t => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  const kill = process.kill;
  let inspection;
  try {
    await client.initialize('luna');
    inspection = t.mock.method(process, 'kill', (pid, signal) => {
      if (pid === -client.process.pid && signal === 0) {
        throw Object.assign(new Error('process inspection denied'), { code: 'EPERM' });
      }
      return kill.call(process, pid, signal);
    });
    await assert.rejects(client.close(), { code: 'PROCESS_GROUP_UNKNOWN' });
    inspection.mock.restore();
    await stopProcessGroup(client.process.pid, 1000);
    await assert.rejects(client.close(), { code: 'PROCESS_GROUP_UNKNOWN' });
  } finally {
    inspection?.mock.restore();
    await stopProcessGroup(client.process.pid, 1000);
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
