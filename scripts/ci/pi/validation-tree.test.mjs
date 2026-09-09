import assert from 'node:assert/strict';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createValidationTree } from '../../../dot_pi/agent/runtime/validation-tree.mjs';

test('validation trees reconstruct immutable topology outside the command workspace and clean up independently', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validation-tree-')));
  const stagingWorkspace = join(parent, 'command');
  const temporaryRoot = join(parent, 'validation');
  let area;
  try {
    await mkdir(stagingWorkspace);
    await mkdir(temporaryRoot);
    await writeFile(join(stagingWorkspace, 'file'), 'command output');
    const records = [
      { path: 'dir/file', type: 'file', mode: 0o700, content: Buffer.from('command output').toString('base64') },
      { path: 'link', type: 'symlink', target: 'dir/file' },
      { path: 'dir', type: 'directory', mode: 0o755 },
    ];
    area = await createValidationTree({ records, stagingWorkspace, temporaryRoot });
    assert.notEqual(area.workspace, stagingWorkspace);
    assert.equal(dirname(area.workspace), temporaryRoot);
    assert.equal((await lstat(area.workspace)).mode & 0o777, 0o700);
    assert.ok((await lstat(join(area.workspace, 'dir'))).isDirectory());
    assert.ok((await lstat(join(area.workspace, 'dir/file'))).isFile());
    assert.equal(await readFile(join(area.workspace, 'dir/file'), 'utf8'), '');
    assert.equal(await readlink(join(area.workspace, 'link')), 'dir/file');
    records[1].target = '../outside';
    await writeFile(join(stagingWorkspace, 'file'), 'later output');
    assert.equal(await readlink(join(area.workspace, 'link')), 'dir/file');
    await Promise.all([area.cleanup(), area.cleanup()]);
    await assert.rejects(access(area.workspace), { code: 'ENOENT' });
    assert.deepEqual(await readdir(temporaryRoot), []);
    assert.equal(await readFile(join(stagingWorkspace, 'file'), 'utf8'), 'later output');
  } finally {
    await area?.cleanup();
    await rm(parent, { recursive: true, force: true });
  }
});
