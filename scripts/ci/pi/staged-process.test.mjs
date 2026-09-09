import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

test('staged process orchestration runs against copied bytes and cleans before returning output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staged-process-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  let workspace;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('writer', ['file.txt']);
    // This fixture replaces only the OS sandbox boundary; it does not test confinement.
    const sandbox = async ({ workspace: stage, command, args }) => {
      workspace = stage;
      assert.equal(await readFile(join(stage, 'file.txt'), 'utf8'), 'original');
      return { command, args, cwd: stage, env: sandboxEnvironment(stage) };
    };
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], temporaryRoot,
      command: '/bin/sh', args: ['-c', 'printf staged > file.txt; cat file.txt'],
    }, sandbox);
    assert.equal(result.stdout, 'staged');
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    assert.equal(result.files[0].path, 'file.txt');
    assert.equal(result.files[0].hash, '0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5');
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.deepEqual(await readdir(temporaryRoot), []);
    await ownership.drain(lease);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('staged execution rejects files outside the lease before calling the sandbox', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staged-scope-'));
  try {
    await writeFile(join(root, 'owned.txt'), 'owned');
    await writeFile(join(root, 'other.txt'), 'other');
    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['owned.txt']);
    await assert.rejects(runStagedProcess({
      ownership, lease, cwd: root, files: ['other.txt'], command: '/bin/sh',
    }, () => { assert.fail('sandbox must not be called'); }), { code: 'OUT_OF_SCOPE' });
    assert.equal(await readFile(join(root, 'other.txt'), 'utf8'), 'other');
    await ownership.drain(lease);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed staged commands discard temporary writes and preserve the original lease', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staged-failure-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('writer', ['file.txt']);
    await assert.rejects(runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], temporaryRoot,
      command: '/bin/sh', args: ['-c', 'printf staged > file.txt; exit 7'],
    }, async ({ workspace, command, args }) => ({ command, args, cwd: workspace, env: sandboxEnvironment(workspace) })),
    { code: 'PROCESS_FAILED', exitCode: 7 });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    assert.deepEqual(await readdir(temporaryRoot), []);
    await ownership.run(lease, async () => {});
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ownership drain waits for staged cancellation and cleanup before renewing the lease', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staged-cancel-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  const controller = new AbortController();
  let execution;
  let workspace;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('writer', ['file.txt']);
    execution = runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], temporaryRoot, signal: controller.signal,
      command: '/bin/sh', args: ['-c', 'printf ready > ready; while :; do :; done'],
    }, async ({ workspace: stage, command, args }) => {
      workspace = stage;
      return { command, args, cwd: stage, env: sandboxEnvironment(stage) };
    });
    const cancelled = assert.rejects(execution, { code: 'ABORT_ERR' });
    const deadline = Date.now() + 3000;
    while (true) {
      try {
        if (workspace) {
          await access(join(workspace, 'ready'));
          break;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      assert.ok(Date.now() < deadline, 'staged process did not become ready');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const drained = ownership.drain(lease);
    await assert.rejects(ownership.run(lease, async () => {}), { code: 'DRAINING' });
    controller.abort();
    await cancelled;
    await drained;
    assert.deepEqual(await readdir(temporaryRoot), []);
    const renewed = ownership.renew(lease);
    assert.equal(renewed.generation, lease.generation + 1);
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
  } finally {
    controller.abort();
    await execution?.catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test('unsupported platforms fail without launching an unsandboxed fallback', {
  skip: process.platform === 'darwin' ? 'requires a platform without the Seatbelt backend' : false,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staged-unsupported-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('writer', ['file.txt']);
    await assert.rejects(runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], temporaryRoot,
      command: '/bin/sh', args: ['-c', 'printf escaped > "$1"', 'probe', join(cwd, 'file.txt')],
    }), { code: 'UNSUPPORTED_SANDBOX' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unconfirmed staged process termination quarantines the original lease', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staged-quarantine-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  const originalKill = process.kill;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('writer', ['file.txt']);
    process.kill = function (pid, signal) {
      if (pid < 0 && signal === 0) throw Object.assign(new Error('process group cannot be inspected'), { code: 'EPERM' });
      return originalKill.call(process, pid, signal);
    };
    await assert.rejects(runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], temporaryRoot,
      command: '/bin/sh', args: ['-c', 'exit 0'],
    }, async ({ workspace, command, args }) => ({ command, args, cwd: workspace, env: sandboxEnvironment(workspace) })),
    error => error instanceof AggregateError && error.errors.some(cause => cause.code === 'PROCESS_GROUP_UNKNOWN'));
    await assert.rejects(ownership.run(lease, async () => {}), { code: 'QUARANTINED' });
    await assert.rejects(ownership.drain(lease), { code: 'QUARANTINED' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    process.kill = originalKill;
    await rm(root, { recursive: true, force: true });
  }
});
