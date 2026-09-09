import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { captureTree } from '../../../dot_pi/agent/runtime/capture-tree.mjs';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { validateCapturedTree } from '../../../dot_pi/agent/runtime/validation-tree.mjs';

const sandbox = process.platform === 'darwin' ? undefined : async ({ workspace, command, args }) => ({
  command, args, cwd: workspace, env: sandboxEnvironment(workspace),
});

test('staged execution returns natively validated output after both temporary trees are removed', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-stage-validation-')));
  const cwd = join(parent, 'original');
  const temporaryRoot = join(parent, 'validation');
  let workspace;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['file'],
      command: '/bin/sh', args: ['-c', 'printf modified > file && ln -s file alias'],
      capture: async area => {
        workspace = area.workspace;
        return validateCapturedTree({
          records: await captureTree({ ...area, python: '/usr/bin/python3' }),
          stagingWorkspace: area.workspace, temporaryRoot, python: '/usr/bin/python3',
          runProcess: area.runProcess,
        });
      },
    }, sandbox);
    assert.deepEqual(result.captured, [
      { path: 'alias', type: 'symlink', target: 'file' },
      { path: 'file', type: 'file', mode: 0o600, content: Buffer.from('modified').toString('base64') },
    ]);
    assert.ok(Object.isFrozen(result.captured));
    assert.ok(result.captured.every(Object.isFrozen));
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.deepEqual(await readdir(temporaryRoot), []);
    assert.equal(await readFile(join(cwd, 'file'), 'utf8'), 'original');
    await assert.rejects(access(join(cwd, 'alias')), { code: 'ENOENT' });
    await ownership.drain(lease);
    assert.equal(ownership.renew(lease).generation, lease.generation + 1);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('cancelling native validation drains the helper and removes both trees before ownership renewal', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-stage-validation-abort-')));
  const cwd = join(parent, 'original');
  const temporaryRoot = join(parent, 'validation');
  const controller = new AbortController();
  let execution;
  let workspace;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file'), 'original');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    execution = runStagedProcess({
      ownership, lease, cwd, files: ['file'], signal: controller.signal,
      command: '/bin/sh', args: ['-c', 'printf modified > file'],
      capture: async area => {
        workspace = area.workspace;
        return validateCapturedTree({
          records: await captureTree({ ...area, python: '/usr/bin/python3' }),
          stagingWorkspace: area.workspace, temporaryRoot, python: '/usr/bin/python3',
          runProcess: options => area.runProcess({
            ...options,
            args: ['-B', '-I', '-c', 'import os, time; open("ready", "w").write(str(os.getpid())); time.sleep(60)'],
          }),
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
      assert.ok(Date.now() < deadline, 'validation helper did not become ready');
      if (!pid) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal((await readdir(temporaryRoot)).length, 1);
    const drained = ownership.drain(lease);
    await assert.rejects(ownership.run(lease, async () => {}), { code: 'DRAINING' });
    controller.abort();
    await cancelled;
    await drained;
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.deepEqual(await readdir(temporaryRoot), []);
    assert.equal(await readFile(join(cwd, 'file'), 'utf8'), 'original');
    assert.equal(ownership.renew(lease).generation, lease.generation + 1);
  } finally {
    controller.abort();
    await execution?.catch(() => {});
    await rm(parent, { recursive: true, force: true });
  }
});

test('Seatbelt protects destination validation files while native validation checks command-created aliases', {
  skip: process.platform !== 'darwin' && 'requires the real macOS Seatbelt backend',
}, async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-stage-validation-escape-')));
  const cwd = join(parent, 'original');
  const temporaryRoot = join(cwd, 'validation');
  let workspace;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file'), 'original');
    await writeFile(join(temporaryRoot, 'canary'), 'protected');
    let aliases;
    try { await access(join(temporaryRoot, 'CANARY')); aliases = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; aliases = false; }
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('worker', ['.']);
    const execution = runStagedProcess({
      ownership, lease, cwd, files: ['file'],
      command: '/bin/sh',
      args: ['-c', 'if printf compromised > "$1"; then exit 9; fi; printf modified > file && mkdir dir && ln -s .. dir/up && ln -s DIR/UP/../../file escape', 'sh', join(temporaryRoot, 'canary')],
      capture: async area => {
        workspace = area.workspace;
        return validateCapturedTree({
          records: await captureTree({ ...area, python: '/usr/bin/python3' }),
          stagingWorkspace: area.workspace, temporaryRoot, python: '/usr/bin/python3',
          runProcess: area.runProcess,
        });
      },
    });
    if (aliases) {
      await assert.rejects(execution, error => {
        assert.equal(error.code, 'PROCESS_FAILED');
        assert.match(error.stderr, /link target escapes validation root/);
        return true;
      });
    } else {
      const result = await execution;
      assert.deepEqual(result.captured.find(record => record.path === 'escape'), {
        path: 'escape', type: 'symlink', target: 'DIR/UP/../../file',
      });
    }
    assert.equal(await readFile(join(temporaryRoot, 'canary'), 'utf8'), 'protected');
    assert.deepEqual(await readdir(temporaryRoot), ['canary']);
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'file'), 'utf8'), 'original');
    await assert.rejects(access(join(cwd, 'escape')), { code: 'ENOENT' });
    await ownership.drain(lease);
    assert.equal(ownership.renew(lease).generation, lease.generation + 1);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
