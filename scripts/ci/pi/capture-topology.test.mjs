import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/capture-tree.py', import.meta.url));

test('topology capture records file metadata and raw external links without opening file contents', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-capture-topology-'));
  const root = join(parent, 'tree');
  const outside = join(parent, 'outside');
  try {
    await mkdir(root);
    await mkdir(join(root, 'dir'), { mode: 0o700 });
    await writeFile(join(root, 'dir/file'), 'private file contents');
    await chmod(join(root, 'dir/file'), 0o600);
    await writeFile(outside, 'outside sentinel');
    await symlink('../outside', join(root, 'external'));
    const { stdout, stderr } = await execute('/usr/bin/python3', ['-B', '-I', '-c', `
import json, os, runpy, sys
capture = runpy.run_path(sys.argv[1])["capture_tree"]
def reject_file_open(event, args):
    if event == "open" and not args[2] & os.O_DIRECTORY:
        raise AssertionError("topology capture opened file contents")
sys.addaudithook(reject_file_open)
json.dump(capture(sys.argv[2], max_bytes=0, topology_only=True), sys.stdout)
`, helper, root]);
    assert.equal(stderr, '');
    assert.deepEqual(JSON.parse(stdout), [
      { path: 'dir', type: 'directory', mode: 0o700 },
      { path: 'dir/file', type: 'file', mode: 0o600 },
      { path: 'external', type: 'symlink', target: '../outside' },
    ]);
    assert.equal(await readFile(join(root, 'dir/file'), 'utf8'), 'private file contents');
    assert.equal(await readFile(outside, 'utf8'), 'outside sentinel');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
