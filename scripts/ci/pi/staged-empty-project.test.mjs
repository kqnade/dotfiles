import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

test('a command can create its first file in an empty staged project', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-empty-project-')));
  const ownership = new Ownership({ cwd });
  const lease = ownership.claim('worker', ['.']);
  let workspace;
  try {
    const result = await runStagedProcess({
      ownership, lease, cwd, files: [], includeProjectFiles: true,
      command: '/bin/sh', args: ['-c', 'mkdir src && printf first > src/file && printf done'],
      snapshot: async area => {
        workspace = area.workspace;
        return readdir(workspace);
      },
      capture: area => readFile(join(area.workspace, 'src/file'), 'utf8'),
    }, process.platform === 'darwin' ? undefined : async ({ workspace, command, args }) => ({
      command, args, cwd: workspace, env: sandboxEnvironment(workspace),
    }));
    assert.equal(result.stdout, 'done');
    assert.equal(result.captured, 'first');
    assert.deepEqual(result.baseline, []);
    assert.deepEqual(result.files, []);
    assert.deepEqual(await readdir(cwd), []);
    await assert.rejects(access(workspace), { code: 'ENOENT' });
  } finally {
    await ownership.drain(lease);
    await rm(cwd, { recursive: true, force: true });
  }
});
