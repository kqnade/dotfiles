import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { startBroker } from '../../../dot_pi/agent/runtime/broker.mjs';
import { connect } from '../../../dot_pi/agent/runtime/ipc.mjs';
import { sha256 } from '../../../dot_pi/agent/runtime/ownership.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (read, predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (predicate(value)) return value;
    } catch (error) {
      if (error.message !== 'Agent is not runnable') throw error;
    }
    await wait(10);
  }
  throw new Error('condition was not reached before timeout');
};

test('the authenticated root reads and updates a file through the broker', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-test-'));
  let broker;
  let client;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    broker = await startBroker({ cwd, directory: join(cwd, 'journal'), command: process.execPath, args: [fixture] });
    client = await connect(broker.connection);
    assert.equal((await client.call('permit')).role, 'root');
    const original = await client.call('read', { path: 'code.txt' });
    assert.equal(original.text, 'source');
    assert.equal(original.hash, sha256('source'));
    const result = await client.call('write', { path: 'code.txt', text: 'edited', expectedHash: original.hash });
    assert.equal(result.hash, sha256('edited'));
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'edited');
    await assert.rejects(client.call('write', { path: 'code.txt', text: 'stale', expectedHash: original.hash }), /preimage hash mismatch/);
  } finally {
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('the authenticated root edits one unique literal with a compare-and-swap hash', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-edit-'));
  let broker;
  let client;
  try {
    const target = join(cwd, 'code.txt');
    const originalText = 'prefix\nneedle\nsuffix\n';
    await writeFile(target, originalText);
    broker = await startBroker({ cwd, directory: join(cwd, 'journal'), command: process.execPath, args: [fixture] });
    client = await connect(broker.connection);

    const original = await client.call('read', { path: 'code.txt' });
    const edited = await client.call('edit', {
      path: 'code.txt', oldText: 'needle', newText: 'replacement', expectedHash: original.hash,
    });
    const editedText = 'prefix\nreplacement\nsuffix\n';
    assert.equal(edited.hash, sha256(editedText));
    assert.equal(await readFile(target, 'utf8'), editedText);

    await assert.rejects(client.call('edit', {
      path: 'code.txt', oldText: 'replacement', newText: 'stale', expectedHash: original.hash,
    }), /preimage hash mismatch/);
    assert.equal(await readFile(target, 'utf8'), editedText);

    const ambiguous = 'same\nsame\n';
    await writeFile(join(cwd, 'ambiguous.txt'), ambiguous);
    const ambiguousRead = await client.call('read', { path: 'ambiguous.txt' });
    await assert.rejects(client.call('edit', {
      path: 'ambiguous.txt', oldText: 'same', newText: 'changed', expectedHash: ambiguousRead.hash,
    }), /unique oldText match/);
    assert.equal(await readFile(join(cwd, 'ambiguous.txt'), 'utf8'), ambiguous);

    await assert.rejects(client.call('edit', {
      path: 'code.txt', oldText: 'replacement', newText: 'missing hash',
    }), /edit requires expectedHash/);
    await assert.rejects(client.call('edit', {
      path: 'code.txt', oldText: 'replacement', newText: 'null hash', expectedHash: null,
    }), /edit requires expectedHash/);
    assert.equal(await readFile(target, 'utf8'), editedText);
  } finally {
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('broker workers authenticate individually and delegate through the same supervisor', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-delegate-'));
  let broker;
  let client;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    broker = await startBroker({ cwd, directory: join(cwd, 'journal'), command: process.execPath, args: [fixture] });
    client = await connect(broker.connection);
    const [astra] = await client.call('delegate', { tasks: [{
      role: 'astra', task: 'Delegate a broker write to Luna.', paths: ['code.txt'],
    }] });
    assert.equal(astra.result.text, 'Luna wrote through the broker');
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'written by Luna');
    assert.equal((await client.call('permit')).role, 'root');
  } finally {
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('cancelling an active delegation stops the worker before a delayed broker write', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-cancel-'));
  let broker;
  let client;
  let pending;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const directory = join(cwd, 'journal');
    broker = await startBroker({
      cwd,
      directory,
      command: process.execPath,
      args: [fixture],
      env: { ...process.env, RPC_PROMPT_DELAY: '300', RPC_WRITE_AFTER_DELAY: 'code.txt' },
    });
    client = await connect(broker.connection);
    const controller = new AbortController();
    pending = client.call('delegate', {
      tasks: [{ role: 'astra', task: 'Reply slowly', paths: ['code.txt'] }],
    }, { signal: controller.signal });
    const pendingOutcome = pending.then(() => undefined, error => error);
    const markerName = (await readdir(directory)).find(name => name.endsWith('.json'));
    const markerPath = join(directory, markerName);
    const running = await waitFor(
      async () => JSON.parse(await readFile(markerPath, 'utf8')),
      marker => Object.values(marker.jobs).find(job => job.role === 'astra' && job.state === 'running'),
    );
    const job = Object.values(running.jobs).find(item => item.role === 'astra' && item.state === 'running');
    controller.abort();
    const outcome = await pendingOutcome;
    assert.equal(outcome?.name, 'AbortError');
    assert.equal((await client.call('permit')).role, 'root');
    const stopped = await waitFor(
      async () => JSON.parse(await readFile(markerPath, 'utf8')),
      marker => marker.jobs[job.id]?.state === 'stopped',
    );
    assert.equal(stopped.jobs[job.id].state, 'stopped');
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'source');
    assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
    const [next] = await client.call('delegate', {
      tasks: [{ role: 'astra', task: 'Reply OK.', paths: ['code.txt'] }],
    });
    assert.equal(next.result.text, 'OK\u2028verified');
  } finally {
    await pending?.catch(() => {});
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('disconnecting an active delegation stops only that connection worker', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-disconnect-'));
  let broker;
  let client;
  let replacement;
  let pending;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const directory = join(cwd, 'journal');
    broker = await startBroker({
      cwd,
      directory,
      command: process.execPath,
      args: [fixture],
      env: { ...process.env, RPC_PROMPT_DELAY: '300', RPC_WRITE_AFTER_DELAY: 'code.txt' },
    });
    client = await connect(broker.connection);
    pending = client.call('delegate', {
      tasks: [{ role: 'astra', task: 'Reply slowly', paths: ['code.txt'] }],
    });
    const pendingOutcome = pending.then(() => undefined, error => error);
    const markerName = (await readdir(directory)).find(name => name.endsWith('.json'));
    const markerPath = join(directory, markerName);
    const running = await waitFor(
      async () => JSON.parse(await readFile(markerPath, 'utf8')),
      marker => Object.values(marker.jobs).find(job => job.role === 'astra' && job.state === 'running'),
    );
    const job = Object.values(running.jobs).find(item => item.role === 'astra' && item.state === 'running');
    await client.close();
    assert.match((await pendingOutcome).message, /connection closed/i);
    const stopped = await waitFor(
      async () => JSON.parse(await readFile(markerPath, 'utf8')),
      marker => marker.jobs[job.id]?.state === 'stopped',
    );
    assert.equal(stopped.jobs[job.id].state, 'stopped');
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'source');
    assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
    replacement = await connect(broker.connection);
    await waitFor(
      () => replacement.call('permit'),
      identity => identity.role === 'root',
    );
    const [next] = await replacement.call('delegate', {
      tasks: [{ role: 'astra', task: 'Reply OK.', paths: ['code.txt'] }],
    });
    assert.equal(next.result.text, 'OK\u2028verified');
  } finally {
    await pending?.catch(() => {});
    await replacement?.close();
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('timing out an active delegation stops the worker before a delayed broker write', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-timeout-'));
  let broker;
  let client;
  let pending;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const directory = join(cwd, 'journal');
    broker = await startBroker({
      cwd,
      directory,
      command: process.execPath,
      args: [fixture],
      env: { ...process.env, RPC_PROMPT_DELAY: '3000', RPC_WRITE_AFTER_DELAY: 'code.txt' },
    });
    client = await connect({ ...broker.connection, timeoutMs: 1000 });
    pending = client.call('delegate', {
      tasks: [{ role: 'astra', task: 'Reply slowly', paths: ['code.txt'] }],
    }, { timeoutMs: 500 });
    const pendingOutcome = pending.then(() => undefined, error => error);
    const markerName = (await readdir(directory)).find(name => name.endsWith('.json'));
    const markerPath = join(directory, markerName);
    const running = await waitFor(
      async () => JSON.parse(await readFile(markerPath, 'utf8')),
      marker => Object.values(marker.jobs).find(job => job.role === 'astra' && job.state === 'running'),
    );
    const job = Object.values(running.jobs).find(item => item.role === 'astra' && item.state === 'running');
    const outcome = await pendingOutcome;
    assert.equal(outcome?.code, 'ETIMEDOUT');
    assert.match(outcome?.message ?? '', /timed out/i);
    const stopped = await waitFor(
      async () => JSON.parse(await readFile(markerPath, 'utf8')),
      marker => marker.jobs[job.id]?.state === 'stopped',
    );
    assert.equal(stopped.jobs[job.id].state, 'stopped');
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'source');
    assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
    await waitFor(
      () => client.call('permit'),
      identity => identity.role === 'root',
    );
  } finally {
    await pending?.catch(() => {});
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
