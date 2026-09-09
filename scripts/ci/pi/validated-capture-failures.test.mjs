import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { validateCapturedTree } from '../../../dot_pi/agent/runtime/validation-tree.mjs';

const assertEmptyDirectory = async (directory) => {
  assert.deepEqual(await readdir(directory), []);
};

const hasCaseAlias = async (temporaryRoot, upper = 'A', lower = 'a') => {
  const upperPath = join(temporaryRoot, upper);
  const lowerPath = join(temporaryRoot, lower);
  try {
    await writeFile(upperPath, 'upper');
    try {
      await writeFile(lowerPath, 'lower', { flag: 'wx' });
      await unlink(lowerPath);
      return false;
    } catch (error) {
      if (error.code === 'EEXIST') {
        return true;
      }
      throw error;
    }
  } finally {
    await rm(upperPath, { force: true });
  }
};

test('validateCapturedTree applies native case alias lookup during helper validation', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validate-cases-')));
  const stagingWorkspace = join(parent, 'command');
  const temporaryRoot = join(parent, 'validation');
  try {
    await mkdir(stagingWorkspace);
    await mkdir(temporaryRoot);
    await writeFile(join(parent, 'outside'), 'sentinel');

    const records = [
      { path: 'dir', type: 'directory', mode: 0o700 },
      { path: 'dir/up', type: 'symlink', target: '..' },
      { path: 'escape', type: 'symlink', target: 'DIR/UP/../../outside' },
    ];

    const ownership = new Ownership({ cwd: stagingWorkspace });
    const lease = ownership.claim('validator', ['.']);
    const nativeCaseAlias = await hasCaseAlias(temporaryRoot, 'A', 'a');

    if (nativeCaseAlias) {
      await assert.rejects(validateCapturedTree({
        records,
        stagingWorkspace,
        temporaryRoot,
        python: '/usr/bin/python3',
        runProcess: options => ownership.runProcess(lease, options),
      }), error => {
        assert.equal(error.code, 'PROCESS_FAILED');
        assert.match(error.stderr, /link target escapes validation root/);
        return true;
      });
    } else {
      const result = await validateCapturedTree({
        records,
        stagingWorkspace,
        temporaryRoot,
        python: '/usr/bin/python3',
        runProcess: options => ownership.runProcess(lease, options),
      });
      assert.deepEqual(result, [
        { path: 'dir', type: 'directory', mode: 0o700 },
        { path: 'dir/up', type: 'symlink', target: '..' },
        { path: 'escape', type: 'symlink', target: 'DIR/UP/../../outside' },
      ]);
    }

    await assertEmptyDirectory(temporaryRoot);
    assert.equal(await readFile(join(parent, 'outside'), 'utf8'), 'sentinel');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('validateCapturedTree cleans validation workspace and keeps lease usable after interpreter resolution failure', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validate-launch-')));
  const stagingWorkspace = join(parent, 'command');
  const temporaryRoot = join(parent, 'validation');
  try {
    await mkdir(stagingWorkspace);
    await mkdir(temporaryRoot);
    await writeFile(join(parent, 'outside'), 'sentinel');

    const ownership = new Ownership({ cwd: stagingWorkspace });
    const lease = ownership.claim('validator', ['.']);
    await assert.rejects(validateCapturedTree({
      records: [
        { path: 'file', type: 'file', mode: 0o644, content: Buffer.from('payload').toString('base64') },
      ],
      stagingWorkspace,
      temporaryRoot,
      python: join(parent, 'missing-python'),
      runProcess: options => ownership.runProcess(lease, options),
    }), error => {
      assert.equal(error.code, 'ENOENT');
      return true;
    });

    await assertEmptyDirectory(temporaryRoot);
    assert.equal(await readFile(join(parent, 'outside'), 'utf8'), 'sentinel');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
