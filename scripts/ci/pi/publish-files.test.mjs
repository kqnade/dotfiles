import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { publishCapturedFiles } from '../../../dot_pi/agent/runtime/publish-files.mjs';

const file = (path, text) => ({ path, type: 'file', mode: 0o600, content: Buffer.from(text).toString('base64') });

test('captured file publication creates, updates, and removes files while retaining unchanged files', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-publish-files-')));
  const ownership = new Ownership({ cwd });
  const lease = ownership.claim('worker', ['.']);
  try {
    await writeFile(join(cwd, 'updated'), 'before');
    await writeFile(join(cwd, 'removed'), 'remove');
    await writeFile(join(cwd, 'retained'), 'keep');
    const baseline = [file('updated', 'before'), file('removed', 'remove'), file('retained', 'keep')];
    const captured = [file('created', 'new'), file('updated', 'after'), file('retained', 'keep')];
    const changes = await publishCapturedFiles({ ownership, lease, baseline, captured });
    assert.deepEqual(changes, ['created', 'removed', 'updated']);
    assert.deepEqual((await readdir(cwd)).sort(), ['created', 'retained', 'updated']);
    assert.equal(await readFile(join(cwd, 'created'), 'utf8'), 'new');
    assert.equal(await readFile(join(cwd, 'updated'), 'utf8'), 'after');
    assert.equal(await readFile(join(cwd, 'retained'), 'utf8'), 'keep');
  } finally {
    await ownership.drain(lease);
    await rm(cwd, { recursive: true, force: true });
  }
});

test('publication reports completed paths when a later file has changed externally', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-publish-conflict-')));
  const ownership = new Ownership({ cwd });
  const lease = ownership.claim('worker', ['.']);
  try {
    await writeFile(join(cwd, 'z'), 'external edit');
    await assert.rejects(publishCapturedFiles({
      ownership, lease, baseline: [file('z', 'before')], captured: [file('a', 'created'), file('z', 'after')],
    }), error => {
      assert.equal(error.code, 'PREIMAGE_MISMATCH');
      assert.deepEqual(error.publishedPaths, ['a']);
      assert.ok(Object.isFrozen(error.publishedPaths));
      return true;
    });
    assert.equal(await readFile(join(cwd, 'a'), 'utf8'), 'created');
    assert.equal(await readFile(join(cwd, 'z'), 'utf8'), 'external edit');
  } finally {
    await ownership.drain(lease);
    await rm(cwd, { recursive: true, force: true });
  }
});
