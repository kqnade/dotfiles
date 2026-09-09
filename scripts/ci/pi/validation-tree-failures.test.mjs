import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, readdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createValidationTree } from '../../../dot_pi/agent/runtime/validation-tree.mjs';

const readOnlyEntries = async (root) => new Set(await readdir(root));

const assertNoValidationWorkspaces = async (within) => {
  const names = await readdir(within);
  assert.equal(names.some((name) => name.startsWith('pi-validation-')), false);
};

const isCaseInsensitiveFilesystem = async () => {
  const fixture = await realpath(await mkdtemp(join(tmpdir(), 'pi-validation-case-')));
  const upper = join(fixture, 'A');
  const lower = join(fixture, 'a');
  let caseSensitive;
  try {
    await writeFile(upper, 'upper');
    try {
      await writeFile(lower, 'lower', { flag: 'wx' });
      caseSensitive = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      caseSensitive = false;
    }
    return !caseSensitive;
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
};

const validationRecordForFile = ({ path, content = 'payload' }) => ({
  path,
  type: 'file',
  mode: 0o644,
  content: Buffer.from(content, 'utf8').toString('base64'),
});

const rejectsWithCode = async (code, action) => {
  try {
    await action();
    throw new Error('expected rejection');
  } catch (error) {
    assert.equal(error.code, code);
    return error;
  }
};

test('rejects invalid validation roots with no temporary tree artifact', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validation-root-')));
  const stagingWorkspace = join(parent, 'staging');
  try {
    await mkdir(stagingWorkspace);
    const nestedTemporary = join(stagingWorkspace, 'nested-temporary');
    await mkdir(nestedTemporary);
    const temporarySymlink = join(parent, 'temporary-link');
    await symlink(stagingWorkspace, temporarySymlink);

    for (const temporaryRoot of [
      stagingWorkspace,
      nestedTemporary,
      temporarySymlink,
    ]) {
      const before = await readOnlyEntries(temporaryRoot);
      const result = await rejectsWithCode('INVALID_VALIDATION_ROOT', () => createValidationTree({
        records: [
          validationRecordForFile({ path: 'file' }),
        ],
        stagingWorkspace,
        temporaryRoot,
      }));
      assert.equal(result.code, 'INVALID_VALIDATION_ROOT');
      await assertNoValidationWorkspaces(temporaryRoot);
      assert.deepEqual(await readOnlyEntries(temporaryRoot), before);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('rejects malformed or duplicate records with INVALID_CAPTURED_TREE and no temporary tree artifact', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validation-records-')));
  const stagingWorkspace = join(parent, 'staging');
  const temporaryRoot = join(parent, 'temporary');
  try {
    await mkdir(stagingWorkspace);
    await mkdir(temporaryRoot);

    for (const records of [
      [
        { path: 'file', type: 'file', mode: 0o644 },
      ],
      [
        validationRecordForFile({ path: 'file', content: 'payload' }),
        validationRecordForFile({ path: 'file', content: 'other' }),
      ],
    ]) {
      const before = await readOnlyEntries(temporaryRoot);
      await rejectsWithCode('INVALID_CAPTURED_TREE', () => createValidationTree({
        records,
        stagingWorkspace,
        temporaryRoot,
      }));
      await assertNoValidationWorkspaces(temporaryRoot);
      assert.deepEqual(await readOnlyEntries(temporaryRoot), before);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('probes case sensitivity for A and a records: duplicate creation behavior and cleanup semantics', async () => {
  const isCaseInsensitive = await isCaseInsensitiveFilesystem();
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-validation-cases-')));
  const stagingWorkspace = join(parent, 'staging');
  const temporaryRoot = join(parent, 'temporary');
  try {
    await mkdir(stagingWorkspace);
    await mkdir(temporaryRoot);

    if (isCaseInsensitive) {
      const result = await rejectsWithCode('EEXIST', () => createValidationTree({
        records: [
          validationRecordForFile({ path: 'A' }),
          validationRecordForFile({ path: 'a' }),
        ],
        stagingWorkspace,
        temporaryRoot,
      }));
      assert.equal(result.code, 'EEXIST');
      assert.deepEqual(await readdir(temporaryRoot), []);
    } else {
      const area = await createValidationTree({
        records: [
          validationRecordForFile({ path: 'A' }),
          validationRecordForFile({ path: 'a' }),
        ],
        stagingWorkspace,
        temporaryRoot,
      });
      try {
        assert.equal(await readFile(join(area.workspace, 'A'), 'utf8'), '');
        assert.equal(await readFile(join(area.workspace, 'a'), 'utf8'), '');
      } finally {
        await area.cleanup();
      }
      await assertNoValidationWorkspaces(temporaryRoot);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
