import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { validateCapturedTree } from '../../../dot_pi/agent/runtime/validation-tree.mjs';

test('native validation returns the reconstructed snapshot despite later command workspace and input changes', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validated-capture-')));
  const stagingWorkspace = join(parent, 'command');
  const temporaryRoot = join(parent, 'validation');
  try {
    await mkdir(stagingWorkspace);
    await mkdir(temporaryRoot);
    await writeFile(join(parent, 'outside'), 'sentinel');
    await writeFile(join(stagingWorkspace, 'file'), 'output');
    await symlink('file', join(stagingWorkspace, 'alias'));
    const records = [
      { path: 'file', type: 'file', mode: 0o644, content: Buffer.from('output').toString('base64') },
      { path: 'alias', type: 'symlink', target: 'file' },
    ];
    const expected = structuredClone([records[1], records[0]]);
    const ownership = new Ownership({ cwd: stagingWorkspace });
    const lease = ownership.claim('validator', ['.']);
    const result = await validateCapturedTree({
      records, stagingWorkspace, temporaryRoot, python: '/usr/bin/python3',
      runProcess: async options => {
        await unlink(join(stagingWorkspace, 'alias'));
        await symlink('../outside', join(stagingWorkspace, 'alias'));
        records[1].target = '../outside';
        records[0].content = Buffer.from('later output').toString('base64');
        return ownership.runProcess(lease, options);
      },
    });
    assert.deepEqual(result, expected);
    assert.ok(Object.isFrozen(result));
    assert.ok(result.every(Object.isFrozen));
    assert.deepEqual(await readdir(temporaryRoot), []);
    assert.equal(await readFile(join(parent, 'outside'), 'utf8'), 'sentinel');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
