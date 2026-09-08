import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startSession } from '../../../dot_pi/agent/runtime/session.mjs';
import { stopProcessGroup } from '../../../dot_pi/agent/runtime/ownership.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));

test('a session journals its scoped RPC worker before prompting and confirms its stop', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-session-')));
  const directory = join(cwd, 'journal');
  let session;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    session = await startSession({
      cwd, directory, rootId: 'root', command: process.execPath, args: [fixture],
      env: { ...process.env, RPC_REQUIRE_JOURNAL: directory },
    });
    const [result] = await session.delegate([{ role: 'astra', task: 'Reply OK.', paths: ['./code.txt'] }]);
    assert.deepEqual(result.result, { text: 'OK\u2028verified', model: 'gpt-6-astra' });
    const [name] = await readdir(directory);
    const marker = JSON.parse(await readFile(join(directory, name), 'utf8'));
    const job = marker.jobs[result.id];
    assert.equal(job.state, 'stopped');
    assert.equal(job.role, 'astra');
    assert.deepEqual(job.paths, [join(cwd, 'code.txt')]);
    assert.notEqual(job.pid, process.pid);
    assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
    assert.equal(session.snapshot().available, 4);
    await session.close();
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await session?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('closing an active session stops its worker before removing the marker', async t => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-session-close-')));
  const directory = join(cwd, 'journal');
  let session;
  let delegated;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    session = await startSession({
      cwd, directory, command: process.execPath, args: [fixture],
      env: { ...process.env, RPC_PROMPT_DELAY: '10000' },
    });
    const operation = session.delegate([{ role: 'astra', task: 'Reply slowly', paths: ['code.txt'] }]);
    delegated = assert.rejects(operation, /Delegated tasks failed/);
    const [name] = await readdir(directory);
    let job;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const marker = JSON.parse(await readFile(join(directory, name), 'utf8'));
      job = Object.values(marker.jobs).find(job => job.state === 'running');
      if (job) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(job, 'worker must be running before shutdown');
    const kill = process.kill;
    const observedStates = [];
    t.mock.method(process, 'kill', (pid, signal) => {
      if (pid === -job.pid && signal === 'SIGTERM') {
        const marker = JSON.parse(readFileSync(join(directory, name), 'utf8'));
        observedStates.push(marker.jobs[job.id].state);
      }
      return kill.call(process, pid, signal);
    });
    const closing = session.close();
    await assert.rejects(session.delegate([{ role: 'astra', task: 'late', paths: ['code.txt'] }]), /Session is closed/);
    await closing;
    await delegated;
    assert.deepEqual(observedStates, ['stopping']);
    assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
    assert.deepEqual(await readdir(directory), []);
    assert.equal(session.snapshot().available, 4);
  } finally {
    await delegated;
    await session?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a journal write failure stops the worker and retains the unresolved session marker', async t => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-session-journal-failure-')));
  const directory = join(cwd, 'journal');
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const session = await startSession({ cwd, directory, command: process.execPath, args: [fixture] });
    const [name] = await readdir(directory);
    const before = await readFile(join(directory, name), 'utf8');
    const kill = process.kill;
    const groups = new Set();
    t.mock.method(process, 'kill', (pid, signal) => {
      if (pid < 0) groups.add(pid);
      return kill.call(process, pid, signal);
    });
    await chmod(directory, 0o500);
    await assert.rejects(session.delegate([{ role: 'astra', task: 'Reply OK.', paths: ['code.txt'] }]), /Delegated tasks failed/);
    await assert.rejects(session.close(), { code: 'EACCES' });
    await assert.rejects(session.delegate([{ role: 'astra', task: 'retry', paths: ['code.txt'] }]), { code: 'EACCES' });
    assert.equal(groups.size, 1);
    for (const pid of groups) assert.throws(() => kill.call(process, pid, 0), { code: 'ESRCH' });
    assert.equal(await readFile(join(directory, name), 'utf8'), before);
    assert.equal(session.snapshot().available, 4);
  } finally {
    await chmod(directory, 0o700);
    await rm(cwd, { recursive: true, force: true });
  }
});

test('unconfirmed termination keeps the worker quarantined and reports its stop failure', async t => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-session-stop-failure-')));
  const directory = join(cwd, 'journal');
  const groups = new Set();
  let inspection;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const session = await startSession({ cwd, directory, command: process.execPath, args: [fixture] });
    const kill = process.kill;
    inspection = t.mock.method(process, 'kill', (pid, signal) => {
      if (pid < 0 && signal === 0) {
        groups.add(pid);
        throw Object.assign(new Error('process inspection denied'), { code: 'EPERM' });
      }
      return kill.call(process, pid, signal);
    });
    await assert.rejects(
      session.delegate([{ role: 'astra', task: 'Reply OK.', paths: ['code.txt'] }]),
      error => error.errors?.[0].cause?.code === 'PROCESS_GROUP_UNKNOWN',
    );
    await assert.rejects(session.close(), { code: 'PROCESS_GROUP_UNKNOWN' });
    await assert.rejects(session.delegate([{ role: 'astra', task: 'retry', paths: ['code.txt'] }]), { code: 'PROCESS_GROUP_UNKNOWN' });
    const [name] = await readdir(directory);
    const marker = JSON.parse(await readFile(join(directory, name), 'utf8'));
    const [job] = Object.values(marker.jobs);
    assert.equal(job.state, 'quarantined');
    assert.deepEqual(session.snapshot().quarantined, [job.id]);
    assert.equal(session.snapshot().available, 3);
  } finally {
    inspection?.mock.restore();
    for (const pid of groups) await stopProcessGroup(-pid, 1000);
    await rm(cwd, { recursive: true, force: true });
  }
});
