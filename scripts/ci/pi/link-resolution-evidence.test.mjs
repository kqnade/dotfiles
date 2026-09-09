import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/validate-tree.py', import.meta.url));

test('native link evidence detects an unchanged reverse dependent escaping after an intermediate link changes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-link-evidence-'));
  try {
    const roots = [join(parent, 'baseline'), join(parent, 'projected')];
    await writeFile(join(parent, 'outside'), 'external sentinel');
    for (const [index, root] of roots.entries()) {
      await mkdir(join(root, 'dir'), { recursive: true });
      await writeFile(join(root, 'file'), 'internal');
      await symlink(index === 0 ? '.' : '..', join(root, 'dir', 'up'));
      await symlink('dir/up/../file', join(root, 'a'));
      await symlink('../outside', join(root, 'unrelated'));
    }
    const { stdout } = await execute('/usr/bin/python3', ['-B', '-I', '-c', `
import json, runpy, sys
inspect = runpy.run_path(sys.argv[1])["inspect_tree_links"]
print(json.dumps([inspect(root) for root in sys.argv[2:]]))
`, helper, ...roots]);
    const [before, after] = JSON.parse(stdout);
    assert.deepEqual(before.map(({ path, status }) => [path, status]), [
      ['a', 'contained'], ['dir/up', 'contained'], ['unrelated', 'escapes'],
    ]);
    assert.deepEqual(after.map(({ path, status }) => [path, status]), [
      ['a', 'escapes'], ['dir/up', 'contained'], ['unrelated', 'escapes'],
    ]);
    assert.equal(before[0].target, after[0].target);
    assert.notDeepEqual(before[0].trace, after[0].trace);
    assert.deepEqual(before[2], after[2]);
    assert.equal(await readFile(join(parent, 'outside'), 'utf8'), 'external sentinel');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
