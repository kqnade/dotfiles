import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';
import { captureTree } from '../../../dot_pi/agent/runtime/capture-tree.mjs';
import { compareCapturedTrees } from '../../../dot_pi/agent/runtime/tree-changes.mjs';

const sandbox = process.platform === 'darwin' ? undefined : async ({ workspace, command, args }) => ({
  command, args, cwd: workspace, env: sandboxEnvironment(workspace),
});

test('ownership drain waits for cancellation of a capture helper and staging cleanup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-output-helper-abort-'));
  const controller = new AbortController();
  let execution;
  let workspace;
  try {
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    execution = runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], signal: controller.signal,
      command: '/bin/sh', args: ['-c', 'printf modified > file.txt'],
      capture: area => {
        workspace = area.workspace;
        return area.runProcess({
          command: '/usr/bin/python3',
          args: ['-I', '-c', 'import os, time; open("ready", "w").write(str(os.getpid())); time.sleep(60)'],
          cwd: workspace, env: sandboxEnvironment(workspace),
        });
      },
    }, sandbox);
    const cancelled = assert.rejects(execution, { code: 'ABORT_ERR' });
    const deadline = Date.now() + 10_000;
    let pid;
    while (!pid) {
      if (workspace) {
        try { pid = Number(await readFile(join(workspace, 'ready'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      assert.ok(Date.now() < deadline, 'capture helper did not become ready');
      if (!pid) await new Promise(resolve => setTimeout(resolve, 10));
    }
    const drained = ownership.drain(lease);
    await assert.rejects(ownership.run(lease, async () => {}), { code: 'DRAINING' });
    controller.abort();
    await cancelled;
    await drained;
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    assert.equal(ownership.renew(lease).generation, lease.generation + 1);
  } finally {
    controller.abort();
    await execution?.catch(() => {});
    await rm(cwd, { recursive: true, force: true });
  }
});

test('staged tree baseline includes trusted preparation and precedes command changes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-output-baseline-'));
  try {
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    const capture = area => captureTree({ ...area, python: '/usr/bin/python3' });
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'],
      command: '/bin/sh', args: ['-c', 'printf modified > file.txt'],
      prepare: async ({ workspace }) => {
        await writeFile(join(workspace, 'runtime.txt'), 'runtime', { mode: 0o600 });
        return {};
      },
      snapshot: capture,
      capture,
    }, sandbox);
    const runtime = { path: 'runtime.txt', type: 'file', mode: 0o600, content: Buffer.from('runtime').toString('base64') };
    assert.deepEqual(result.baseline, [
      { path: 'file.txt', type: 'file', mode: 0o600, content: Buffer.from('original').toString('base64') },
      runtime,
    ]);
    assert.deepEqual(result.captured, [
      { path: 'file.txt', type: 'file', mode: 0o600, content: Buffer.from('modified').toString('base64') },
      runtime,
    ]);
    assert.deepEqual(compareCapturedTrees(result.baseline, result.captured), [
      { path: 'file.txt', before: result.baseline[0], after: result.captured[0] },
    ]);
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    await assert.rejects(access(join(cwd, 'runtime.txt')), { code: 'ENOENT' });
    await ownership.drain(lease);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('staged execution captures an immutable tree through a supervised Python helper before cleanup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-output-tree-'));
  let workspace;
  try {
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'],
      command: '/bin/sh',
      args: ['-c', 'printf modified > file.txt; mkdir -m 700 generated; printf created > generated/new.txt; chmod 600 generated/new.txt'],
      capture: area => {
        workspace = area.workspace;
        return captureTree({ ...area, python: '/usr/bin/python3' });
      },
    }, sandbox);
    assert.deepEqual(result.captured, [
      { path: 'file.txt', type: 'file', mode: 0o600, content: Buffer.from('modified').toString('base64') },
      { path: 'generated', type: 'directory', mode: 0o700 },
      { path: 'generated/new.txt', type: 'file', mode: 0o600, content: Buffer.from('created').toString('base64') },
    ]);
    assert.throws(() => result.captured.push({}), TypeError);
    assert.throws(() => { result.captured[0].content = ''; }, TypeError);
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    await assert.rejects(access(join(cwd, 'generated')), { code: 'ENOENT' });
    await ownership.drain(lease);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('failed output capture preserves its error and cleans the stage without quarantining originals', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-output-failure-'));
  const failure = new Error('output cannot be validated');
  let workspace;
  try {
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['file.txt']);
    await assert.rejects(runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'],
      command: '/bin/sh', args: ['-c', 'printf modified > file.txt'],
      capture: async area => {
        workspace = area.workspace;
        assert.equal(await readFile(join(workspace, 'file.txt'), 'utf8'), 'modified');
        throw failure;
      },
    }, sandbox), error => error === failure);
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('cancellation during output capture discards the result and cleans the stage', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-output-abort-'));
  const controller = new AbortController();
  let workspace;
  try {
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['file.txt']);
    await assert.rejects(runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'], signal: controller.signal,
      command: '/bin/sh', args: ['-c', 'printf modified > file.txt'],
      capture: async area => {
        workspace = area.workspace;
        controller.abort();
        return readFile(join(workspace, 'file.txt'), 'utf8');
      },
    }, sandbox), { code: 'ABORT_ERR' });
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('staged output is captured before cleanup and returned without publishing originals', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-output-capture-'));
  let workspace;
  try {
    await writeFile(join(cwd, 'file.txt'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['file.txt'],
      command: '/bin/sh', args: ['-c', 'printf modified > file.txt; mkdir generated; printf created > generated/new.txt'],
      capture: async area => {
        workspace = area.workspace;
        await new Promise(resolve => setTimeout(resolve, 10));
        return Object.freeze({
          existing: await readFile(join(workspace, 'file.txt'), 'utf8'),
          created: await readFile(join(workspace, 'generated', 'new.txt'), 'utf8'),
        });
      },
    }, sandbox);
    assert.deepEqual(result.captured, { existing: 'modified', created: 'created' });
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'original');
    await assert.rejects(access(join(cwd, 'generated')), { code: 'ENOENT' });
    await ownership.drain(lease);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
