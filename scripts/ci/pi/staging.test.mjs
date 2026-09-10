import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { copyRuntimeTree, createStagingArea } from '../../../dot_pi/agent/runtime/staging.mjs';

test('project context snapshots config dependencies and internal package links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-stage-context-'));
  const cwd = join(root, 'repo');
  let area;
  try {
    await mkdir(join(cwd, 'config'), { recursive: true });
    await mkdir(join(cwd, 'node_modules', '.bin'), { recursive: true });
    await mkdir(join(cwd, 'node_modules', 'formatter'), { recursive: true });
    await writeFile(join(cwd, 'file.js'), 'original');
    await writeFile(join(cwd, 'config', 'options.mjs'), 'export default {};');
    await writeFile(join(cwd, 'node_modules', 'formatter', 'cli.js'), '#!/usr/bin/env node\n', { mode: 0o755 });
    await symlink('../formatter/cli.js', join(cwd, 'node_modules', '.bin', 'formatter'));
    await mkdir(join(cwd, '.git'));
    await writeFile(join(cwd, '.git', 'config'), 'git metadata');
    area = await createStagingArea({ cwd, files: ['file.js'], temporaryRoot: root, includeProjectFiles: true });
    assert.equal(await readFile(join(area.workspace, 'config', 'options.mjs'), 'utf8'), 'export default {};');
    assert.equal(await readFile(join(area.workspace, 'node_modules', '.bin', 'formatter'), 'utf8'), '#!/usr/bin/env node\n');
    await writeFile(join(area.workspace, 'node_modules', '.bin', 'formatter'), 'staged');
    assert.equal(await readFile(join(cwd, 'node_modules', 'formatter', 'cli.js'), 'utf8'), '#!/usr/bin/env node\n');
    await assert.rejects(access(join(area.workspace, '.git')), { code: 'ENOENT' });
    await assert.rejects(copyRuntimeTree(cwd, join(cwd, 'config')), /separate directories/u);
    await assert.rejects(copyRuntimeTree(cwd, root), /separate directories/u);
  } finally {
    if (area) await area.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});

test('project context rejects external links, Git links, and sockets and removes partial copies', async () => {
  const root = await mkdtemp(join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'pi-context-invalid-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'stages');
  let server;
  try {
    await mkdir(cwd);
    await mkdir(temporaryRoot);
    await writeFile(join(cwd, 'file.js'), 'original');
    await writeFile(join(root, 'outside'), 'private');
    const options = { cwd, files: ['file.js'], temporaryRoot, includeProjectFiles: true };
    await symlink(join(root, 'outside'), join(cwd, 'link'));
    await assert.rejects(createStagingArea(options), /link escapes copied files/u);
    assert.deepEqual(await readdir(temporaryRoot), []);
    await rm(join(cwd, 'link'));
    await mkdir(join(cwd, '.git'));
    await writeFile(join(cwd, '.git', 'config'), 'git metadata');
    await symlink('.git/config', join(cwd, 'link'));
    await assert.rejects(createStagingArea(options), /link escapes copied files/u);
    assert.deepEqual(await readdir(temporaryRoot), []);
    await rm(join(cwd, 'link'));
    server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(join(cwd, 'host.sock'), resolve);
    });
    await assert.rejects(createStagingArea(options), /not a regular file, directory, or internal link/u);
    assert.deepEqual(await readdir(temporaryRoot), []);
    assert.equal(await readFile(join(root, 'outside'), 'utf8'), 'private');
  } finally {
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('staging snapshots regular files, isolates edits, and cleans only its temporary area', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staging-test-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  const relativePath = 'src/file.txt';
  const contents = 'original contents\n';
  const configuredOriginalPath = join(cwd, relativePath);
  try {
    await mkdir(join(cwd, 'src'), { recursive: true });
    await mkdir(temporaryRoot);
    await writeFile(configuredOriginalPath, contents);
    const originalPath = join(await realpath(cwd), relativePath);

    const area = await createStagingArea({ cwd, files: [relativePath], temporaryRoot });
    const [file] = area.files;
    assert.deepEqual(file, {
      path: relativePath,
      originalPath,
      stagedPath: join(area.workspace, relativePath),
      hash: sha256(contents),
    });
    assert.ok(Object.isFrozen(area));
    assert.ok(Object.isFrozen(area.files));
    assert.ok(Object.isFrozen(file));
    assert.equal((await stat(area.directory)).mode & 0o777, 0o700);
    assert.equal((await stat(area.workspace)).mode & 0o777, 0o700);
    assert.notDeepEqual(
      await stat(originalPath).then(({ dev, ino }) => ({ dev, ino })),
      await stat(file.stagedPath).then(({ dev, ino }) => ({ dev, ino })),
    );

    await writeFile(file.stagedPath, 'staged contents\n');
    assert.equal(await readFile(originalPath, 'utf8'), contents);

    await area.cleanup();
    await area.cleanup();
    await assert.rejects(access(area.directory), /ENOENT/u);
    await access(temporaryRoot);
    assert.equal(await readFile(originalPath, 'utf8'), contents);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('staging rejects invalid lists, escaping, duplicate, missing, non-regular, and symlink paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staging-invalid-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  const source = join(cwd, 'src', 'file.txt');
  try {
    await mkdir(join(cwd, 'src'), { recursive: true });
    await mkdir(temporaryRoot);
    await writeFile(source, 'contents\n');
    await writeFile(join(root, 'outside.txt'), 'outside\n');
    await access(source);

    await assert.rejects(createStagingArea({ cwd, files: null, temporaryRoot }), /must be an array/u);
    await assert.rejects(createStagingArea({ cwd, files: [source], temporaryRoot }), /escapes cwd/u);
    await assert.rejects(createStagingArea({ cwd, files: ['../outside.txt'], temporaryRoot }), /escapes cwd/u);
    await assert.rejects(
      createStagingArea({ cwd, files: ['src/file.txt', './src/file.txt'], temporaryRoot }),
      /duplicate staging path/u,
    );
    await assert.rejects(createStagingArea({ cwd, files: ['missing.txt'], temporaryRoot }), /source file is missing/u);
    await assert.rejects(createStagingArea({ cwd, files: ['src'], temporaryRoot }), /not a regular file/u);

    await symlink(join(root, 'outside.txt'), join(cwd, 'src', 'link.txt'));
    await assert.rejects(createStagingArea({ cwd, files: ['src/link.txt'], temporaryRoot }), /symlink/u);

    const outsideDirectory = join(root, 'outside-directory');
    await mkdir(outsideDirectory);
    await writeFile(join(outsideDirectory, 'file.txt'), 'outside directory\n');
    await symlink(outsideDirectory, join(cwd, 'linked-directory'));
    await assert.rejects(
      createStagingArea({ cwd, files: ['linked-directory/file.txt'], temporaryRoot }),
      /symlink/u,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('staging rejects a temporary root that would place the stage inside cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-staging-placement-'));
  const cwd = join(root, 'repo');
  const ancestorTemporaryRoot = root;
  try {
    await mkdir(cwd);
    await writeFile(join(cwd, 'file.txt'), 'contents\n');
    await assert.rejects(
      createStagingArea({ cwd, files: ['file.txt'], temporaryRoot: cwd }),
      /separate directories/u,
    );
    await mkdir(join(cwd, 'temporary'));
    await assert.rejects(
      createStagingArea({ cwd, files: ['file.txt'], temporaryRoot: join(cwd, 'temporary') }),
      /separate directories/u,
    );

    const area = await createStagingArea({ cwd, files: ['file.txt'], temporaryRoot: ancestorTemporaryRoot });
    await area.cleanup();
  } finally { await rm(root, { recursive: true, force: true }); }
});
