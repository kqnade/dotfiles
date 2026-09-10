import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import * as capture from '../../../dot_pi/agent/runtime/capture-tree.mjs';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';

test('supervised topology capture returns frozen metadata while ordinary capture retains file bytes', async () => {
  const { stdout } = await promisify(execFile)('/usr/bin/python3', ['-B', '-I', '-c', 'import sys; print(sys.executable)']);
  const python = stdout.trim();
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-topology-process-')));
  const workspace = join(parent, 'tree');
  let ownership;
  let lease;
  try {
    await mkdir(workspace);
    await writeFile(join(workspace, 'file'), 'contents', { mode: 0o600 });
    await symlink('../outside', join(workspace, 'external'));
    ownership = new Ownership({ cwd: workspace });
    lease = ownership.claim('capture', ['.']);
    const options = {
      workspace, python,
      runProcess: options => ownership.runProcess(lease, options),
    };
    const topology = await capture.captureTopology(options);
    assert.deepEqual(topology, [
      { path: 'external', type: 'symlink', target: '../outside' },
      { path: 'file', type: 'file', mode: 0o600 },
    ]);
    assert.ok(Object.isFrozen(topology));
    assert.ok(topology.every(Object.isFrozen));
    const full = await capture.captureTree(options);
    assert.deepEqual(full, [topology[0], { ...topology[1], content: 'Y29udGVudHM=' }]);
  } finally {
    if (lease) await ownership.drain(lease);
    await rm(parent, { recursive: true, force: true });
  }
});
