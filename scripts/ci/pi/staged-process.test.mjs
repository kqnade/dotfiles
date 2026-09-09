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
