import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/capture-tree.py', import.meta.url));

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
