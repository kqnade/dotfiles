import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/capture-tree.py', import.meta.url));

test('tree capture limits metadata independently of file bytes and entry count', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-capture-metadata-'));
  try {
    await symlink('a'.repeat(100), join(root, 'link'));
    await assert.rejects(execute('python3', ['-I', helper, root, '0', '1', '64']), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /capture metadata limit exceeded/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tree capture bounds total entries across directories even when files contain no bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-capture-entries-'));
  try {
    await mkdir(join(root, 'dir'));
    await writeFile(join(root, 'dir', 'a'), '');
    await writeFile(join(root, 'dir', 'b'), '');
    await assert.rejects(execute('python3', ['-I', helper, root, '0', '2']), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /capture entry limit exceeded/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tree capture records symbolic links as targets without traversing directories or dangling links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-capture-links-'));
  try {
    await mkdir(join(root, 'dir'), { mode: 0o700 });
    await symlink('dir', join(root, 'alias'));
    await symlink('../missing', join(root, 'dir', 'dangling'));
    const { stdout } = await execute('python3', ['-I', helper, root]);
    assert.deepEqual(JSON.parse(stdout), [
      { path: 'alias', type: 'symlink', target: 'dir' },
      { path: 'dir', type: 'directory', mode: 0o700 },
      { path: 'dir/dangling', type: 'symlink', target: '../missing' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tree capture rejects aggregate file bytes over its limit without emitting a partial manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-capture-limit-'));
  try {
    await writeFile(join(root, 'a'), 'ab');
    await writeFile(join(root, 'b'), 'cd');
    await assert.rejects(execute('python3', ['-I', helper, root, '3']), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /capture byte limit exceeded/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tree capture records binary bytes, executable mode, and empty directories independently of later writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-capture-tree-'));
  try {
    await mkdir(join(root, 'empty'));
    await mkdir(join(root, 'src'));
    await chmod(join(root, 'empty'), 0o700);
    await chmod(join(root, 'src'), 0o700);
    await writeFile(join(root, 'src', 'tool'), Buffer.from([0, 255, 10]));
    await chmod(join(root, 'src', 'tool'), 0o700);
    const { stdout } = await execute('python3', ['-I', helper, root]);
    await writeFile(join(root, 'src', 'tool'), 'later contents');
    assert.deepEqual(JSON.parse(stdout), [
      { path: 'empty', type: 'directory', mode: 0o700 },
      { path: 'src', type: 'directory', mode: 0o700 },
      { path: 'src/tool', type: 'file', mode: 0o700, content: 'AP8K' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
