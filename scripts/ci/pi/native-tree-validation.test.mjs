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

test('native link validation applies actual case lookup before resolving dot-dot', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-native-link-'));
  const root = join(parent, 'tree');
  try {
    await mkdir(join(root, 'dir'), { recursive: true });
    await symlink('..', join(root, 'dir', 'up'));
    await symlink('DIR/UP/../outside', join(root, 'escape'));
    await writeFile(join(parent, 'outside'), 'synthetic sentinel');
    let aliases;
    try { await lstat(join(root, 'DIR')); aliases = true; }
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
