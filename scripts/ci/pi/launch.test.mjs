import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { launch } from '../../../dot_pi/agent/runtime/launch.mjs';

test('the launcher journals a managed root and closes the broker after root exit', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-launch-'));
  const directory = join(cwd, 'journal');
  const fixture = fileURLToPath(new URL('./fixtures/interactive-root.mjs', import.meta.url));
  try {
    const result = await launch({
      cwd, directory, piEntry: fixture, extensionPath: fixture,
      env: { ...process.env, PI_TEST_JOURNAL: directory }, capture: true,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, 'ROOT_READY\n');
    assert.equal(await readFile(join(cwd, 'created.txt'), 'utf8'), 'root wrote through broker');
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
