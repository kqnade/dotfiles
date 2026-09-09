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

test('projected validation rejects a retained link made external by an intermediate change', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-'));
  try {
    const roots = [join(parent, 'baseline'), join(parent, 'projected')];
    await writeFile(join(parent, 'file'), 'external sentinel');
    for (const [index, root] of roots.entries()) {
      await mkdir(join(root, 'dir'), { recursive: true });
      await writeFile(join(root, 'file'), 'internal');
      await symlink(index === 0 ? '.' : '..', join(root, 'dir', 'up'));
      await symlink('dir/up/../file', join(root, 'a'));
    }
    await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', '-c', `
import runpy, sys
validate = runpy.run_path(sys.argv[1])["validate_projected_links"]
validate(sys.argv[2], sys.argv[3])
print("accepted")
`, helper, ...roots]), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /projected link escapes validation root: a/);
      return true;
    });
    assert.equal(await readFile(join(parent, 'file'), 'utf8'), 'external sentinel');
    assert.equal(await readFile(join(roots[0], 'a'), 'utf8'), 'internal');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
