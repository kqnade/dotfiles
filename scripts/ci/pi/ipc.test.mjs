import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import test from 'node:test';

import { connect, credential, listen } from '../../../dot_pi/agent/runtime/ipc.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('returns concurrent request results in-order by correlation id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'supervisor.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);

  let active = 0;
  let maxActive = 0;
  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async (method, params, identity) => {
      assert.equal(identity.agentId, agentId);
      if (method !== 'echo') {
        throw new Error(`unexpected method ${method}`);
      }
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(params.delay);
      active -= 1;
      return { value: params.value };
    },
  });

  const client = await connect({ socketPath, token, agentId });
  try {
    const responses = await Promise.all([
      client.call('echo', { delay: 60, value: 'first' }),
      client.call('echo', { delay: 10, value: 'second' }),
      client.call('echo', { delay: 30, value: 'third' }),
    ]);

    assert.deepEqual(responses, [
      { value: 'first' },
      { value: 'second' },
      { value: 'third' },
    ]);
    assert.equal(maxActive, 3);
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
    assert.equal((await stat(socketDir)).mode & 0o777, 0o700);
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid credentials and does not call handle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'bad.sock');
  const masterToken = 'master-token';
  const agentA = 'agent-a';
  const agentB = 'agent-b';
  const badToken = credential(masterToken, agentA);
  let called = 0;

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async () => {
      called += 1;
      return { ok: true };
    },
  });

  const client = await connect({ socketPath, token: badToken, agentId: agentB });
  try {
    await assert.rejects(
      client.call('ping', { value: 1 }),
      { message: /invalid authentication|timed out|closed/i },
    );
    assert.equal(called, 0);
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects malformed request frames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'malformed.sock');
  const masterToken = 'master-token';

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async () => {
      assert.fail('handle should not run for malformed frames');
    },
  });

  const socket = createConnection({ path: socketPath });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.resume();

  const closed = new Promise((resolve, reject) => {
    socket.once('close', resolve);
    socket.once('error', reject);
  });

  try {
    socket.write('null\n');
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('malformed frame did not close')), 2000)),
    ]);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses a pre-existing socket path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketPath = join(root, 'stale.sock');
  await writeFile(socketPath, 'stale');

  try {
    await assert.rejects(
      listen({
        socketPath,
        token: 'master-token',
        handle: async () => {
          return { ok: true };
        },
      }),
      { code: 'EADDRINUSE' },
    );
    assert.equal((await stat(socketPath)).size, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('disconnect rejects pending requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'disconnect.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async () => {
      await wait(120);
      return { ok: true };
    },
  });

  const client = await connect({ socketPath, token, agentId, timeoutMs: 1000 });
  const pending = client.call('noop', {});
  await wait(20);

  const rejected = assert.rejects(
    pending,
    { message: /IPC connection closed|closed|disconnected/i },
  );
  await server.close();
  await rejected;
  await assert.rejects(
    client.call('noop', {}),
    { message: /IPC connection is closed/i },
  );
  await client.close();
  await rm(root, { recursive: true, force: true });
});

test('server responds with error on handle failure without disconnecting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'handler-failure.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async (method) => {
      if (method === 'fail') {
        throw new Error('boom');
      }
      return { ok: true };
    },
  });

  const client = await connect({ socketPath, token, agentId });
  try {
    await assert.rejects(client.call('fail', {}), { message: /boom/i });
    const ok = await client.call('ok', {});
    assert.deepEqual(ok, { ok: true });
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
