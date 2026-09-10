import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/capture-tree.py', import.meta.url));

test('both capture modes accept the directory depth boundary and reject a deeper tree without partial output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-capture-depth-'));
  try {
    await mkdir(join(root, 'one/two'), { recursive: true });
    await writeFile(join(root, 'one/two/file'), 'data');
    for (const mode of [[], ['--topology']]) {
      await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', helper, ...mode, '--max-depth', '1', root]), error => {
        assert.equal(error.stdout, '');
        assert.match(error.stderr, /capture directory depth limit exceeded/);
        return true;
      });
      const { stdout, stderr } = await execute('/usr/bin/python3', ['-B', '-I', helper, ...mode, '--max-depth', '2', root]);
      assert.equal(stderr, '');
      const records = JSON.parse(stdout);
      assert.deepEqual(records.map(record => [record.path, record.type]), [
        ['one', 'directory'], ['one/two', 'directory'], ['one/two/file', 'file'],
      ]);
      if (mode.length === 0) assert.equal(records[2].content, 'ZGF0YQ==');
      else assert.equal(Object.hasOwn(records[2], 'content'), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
