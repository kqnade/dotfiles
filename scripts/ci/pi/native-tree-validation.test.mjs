import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/validate-tree.py', import.meta.url));

test('native link validation permits internal relative, directory, and dangling targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-native-internal-'));
  try {
    await mkdir(join(root, 'dir'));
    await writeFile(join(root, 'file'), 'contents');
    await symlink('../file', join(root, 'dir', 'to-file'));
    await symlink('.', join(root, 'dir', 'self'));
    await symlink('dir/to-file', join(root, 'alias'));
    await symlink('dir', join(root, 'directory'));
    await symlink('future/child', join(root, 'dangling'));
    const result = await execute('python3', ['-B', '-I', helper, root]);
    assert.equal(result.stdout, '');
    assert.equal(await readFile(join(root, 'file'), 'utf8'), 'contents');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const [label, directory, alias, upAlias] of [
  ['case', 'dir', 'DIR', 'UP'],
  ['Unicode normalization', '\u00e9', 'e\u0301', 'up'],
]) {
  test(`native link validation applies actual ${label} lookup before resolving dot-dot`, async () => {
    const parent = await mkdtemp(join(tmpdir(), 'pi-native-link-'));
    const root = join(parent, 'tree');
    try {
      await mkdir(join(root, directory), { recursive: true });
      await symlink('..', join(root, directory, 'up'));
      await symlink(`${alias}/${upAlias}/../outside`, join(root, 'escape'));
      await writeFile(join(parent, 'outside'), 'synthetic sentinel');
      let aliases;
      try { await lstat(join(root, alias)); aliases = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; aliases = false; }
      if (aliases) {
        await assert.rejects(execute('python3', ['-B', '-I', helper, root]), error => {
          assert.equal(error.stdout, '');
          assert.match(error.stderr, /link target escapes validation root/);
          return true;
        });
      } else {
        const result = await execute('python3', ['-B', '-I', helper, root]);
        assert.equal(result.stdout, '');
      }
      assert.equal(await readFile(join(parent, 'outside'), 'utf8'), 'synthetic sentinel');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
}
