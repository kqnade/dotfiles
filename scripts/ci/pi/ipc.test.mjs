import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import test from 'node:test';

import { connect, credential, listen } from '../../../dot_pi/agent/runtime/ipc.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nextFrame = (socket) => new Promise((resolve, reject) => {
  let buffer = '';
  const onData = chunk => {
    buffer += chunk.toString();
    const boundary = buffer.indexOf('\n');
    if (boundary === -1) return;
    socket.off('data', onData);
    socket.off('error', onError);
    try {
      resolve(JSON.parse(buffer.slice(0, boundary)));
    } catch (error) {
      reject(error);
    }
  };
  const onError = error => {
    socket.off('data', onData);
    reject(error);
  };
  socket.on('data', onData);
  socket.once('error', onError);
});

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

test('cancels one in-flight request without poisoning the connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'cancel.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);
  const started = Promise.withResolvers();
  const handlerAborted = Promise.withResolvers();
  let aborted = false;

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async (method, params, { signal }) => {
      if (method !== 'slow') return { value: params.value };
      started.resolve();
      await new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          handlerAborted.resolve();
          resolve();
        }, { once: true });
      });
      throw new Error('request cancelled');
    },
  });

  const client = await connect({ socketPath, token, agentId, timeoutMs: 100 });
  try {
    const controller = new AbortController();
    const pending = client.call('slow', {}, { signal: controller.signal });
    await started.promise;
    controller.abort();
    const error = await pending.then(() => undefined, failure => failure);
    assert.equal(error?.name, 'AbortError');
    assert.match(error?.message ?? '', /server reported: request cancelled/);
    assert.doesNotMatch(error?.message ?? '', /server cleanup failed/);
    await Promise.race([
      handlerAborted.promise,
      wait(100).then(() => assert.fail('server handler was not cancelled')),
    ]);
    assert.equal(aborted, true);
    assert.deepEqual(await client.call('echo', { value: 'after' }), { value: 'after' });
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('preserves nested server failures alongside cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'cancel-failure.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);
  const started = Promise.withResolvers();

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async (method, params, { signal }) => {
      if (method !== 'slow') return { value: params.value };
      started.resolve();
      await new Promise((resolve) => signal.addEventListener('abort', async () => {
        await wait(2100);
        resolve();
      }, { once: true }));
      const stopFailure = new Error('process group could not be proven empty');
      const workerFailure = new AggregateError([stopFailure], 'worker stop failed', {
        cause: new Error('worker was quarantined'),
      });
      const delegatedFailure = new AggregateError([workerFailure], 'Delegated tasks failed');
      delegatedFailure.cause = delegatedFailure;
      throw delegatedFailure;
    },
  });

  const client = await connect({ socketPath, token, agentId });
  try {
    const controller = new AbortController();
    const pending = client.call('slow', {}, { signal: controller.signal });
    await started.promise;
    controller.abort();
    const error = await pending.then(() => undefined, failure => failure);
    assert.equal(error?.name, 'AbortError');
    assert.match(error?.message ?? '', /server reported/);
    assert.match(error?.message ?? '', /Delegated tasks failed/);
    assert.match(error?.message ?? '', /worker stop failed/);
    assert.match(error?.message ?? '', /process group could not be proven empty/);
    assert.match(error?.message ?? '', /worker was quarantined/);
    assert.doesNotMatch(error?.message ?? '', /server cleanup failed/);
    assert.ok(error.message.length <= 8192);
    assert.ok(error?.cause instanceof AggregateError);
    assert.match(error.cause.errors.at(-1)?.message ?? '', /worker was quarantined/);
    assert.deepEqual(await client.call('echo', { value: 'after' }), { value: 'after' });
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('times out one in-flight request by cancelling its server handler', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'timeout.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);
  const started = Promise.withResolvers();
  const handlerAborted = Promise.withResolvers();

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async (method, params, { signal }) => {
      if (method !== 'slow') return { value: params.value };
      started.resolve();
      await new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          handlerAborted.resolve();
          resolve();
        }, { once: true });
      });
      throw new Error('request cancelled');
    },
  });

  const client = await connect({ socketPath, token, agentId, timeoutMs: 1000 });
  try {
    const pending = client.call('slow', {}, { timeoutMs: 20 });
    await started.promise;
    await assert.rejects(pending, { code: 'ETIMEDOUT', message: /timed out/i });
    await Promise.race([
      handlerAborted.promise,
      wait(100).then(() => assert.fail('server handler was not cancelled')),
    ]);
    assert.deepEqual(await client.call('echo', { value: 'after' }), { value: 'after' });
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('does not let another authenticated agent cancel a request on the same socket', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'identity.sock');
  const masterToken = 'master-token';
  const agentA = 'agent-a';
  const agentB = 'agent-b';
  const started = Promise.withResolvers();

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async (method, params, { signal }) => {
      if (method !== 'slow') return { value: params.value };
      started.resolve();
      await wait(50);
      return { aborted: signal.aborted };
    },
  });
  const socket = createConnection({ path: socketPath });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  try {
    const response = nextFrame(socket);
    socket.write(`${JSON.stringify({
      id: 'request-1',
      method: 'slow',
      params: {},
      token: credential(masterToken, agentA),
      agentId: agentA,
    })}\n`);
    await started.promise;
    socket.write(`${JSON.stringify({
      id: 'request-1',
      type: 'cancel',
      token: credential(masterToken, agentB),
      agentId: agentB,
    })}\n`);
    const frame = await response;
    assert.equal(frame.success, true);
    assert.deepEqual(frame.result, { aborted: false });
  } finally {
    socket.destroy();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a null per-call timeout disables the connection default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'no-timeout.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async () => {
      await wait(40);
      return { ok: true };
    },
  });
  const client = await connect({ socketPath, token, agentId, timeoutMs: 10 });
  try {
    assert.deepEqual(await client.call('slow', {}, { timeoutMs: null }), { ok: true });
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an unresponsive cancelled handler is rejected as unconfirmed after bounded grace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ipc-'));
  const socketDir = join(root, 'socket');
  await mkdir(socketDir);
  await chmod(socketDir, 0o700);
  const socketPath = join(socketDir, 'unconfirmed.sock');
  const masterToken = 'master-token';
  const agentId = 'agent-1';
  const token = credential(masterToken, agentId);
  const started = Promise.withResolvers();

  const server = await listen({
    socketPath,
    token: masterToken,
    handle: async () => {
      started.resolve();
      await new Promise(() => {});
    },
  });
  const client = await connect({ socketPath, token, agentId, timeoutMs: 1000 });
  let pending;
  try {
    const controller = new AbortController();
    pending = client.call('stuck', {}, { signal: controller.signal });
    const outcome = pending.then(() => undefined, error => error);
    await started.promise;
    controller.abort();
    const error = await outcome;
    assert.equal(error.code, 'IPC_CANCEL_UNCONFIRMED');
    assert.match(error.message, /cancellation was not confirmed/i);
  } finally {
    await pending?.catch(() => {});
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
