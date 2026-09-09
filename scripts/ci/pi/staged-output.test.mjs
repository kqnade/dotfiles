import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

const sandbox = process.platform === 'darwin' ? undefined : async ({ workspace, command, args }) => ({
  command, args, cwd: workspace, env: sandboxEnvironment(workspace),
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
