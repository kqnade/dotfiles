import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership, sha256 } from '../../../dot_pi/agent/runtime/ownership.mjs';

test('owned file removal uses the expected preimage and leaves other files intact', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-remove-')));
  const ownership = new Ownership({ cwd });
  const lease = ownership.claim('worker', ['file']);
  try {
    await writeFile(join(cwd, 'file'), 'original');
    await writeFile(join(cwd, 'other'), 'retained');
    const result = await ownership.run(lease, () => ownership.remove(lease, 'file', { expectedHash: sha256('original') }));
    assert.deepEqual(result, { path: join(cwd, 'file'), hash: null });
    await assert.rejects(access(join(cwd, 'file')), { code: 'ENOENT' });
    assert.equal(await readFile(join(cwd, 'other'), 'utf8'), 'retained');
  } finally {
    await ownership.drain(lease);
    await rm(cwd, { recursive: true, force: true });
  }
});

test('file removal preserves a preceding edit and rejects files outside the assigned scope', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-remove-conflict-')));
  const ownership = new Ownership({ cwd });
  const lease = ownership.claim('worker', ['file']);
  try {
    await writeFile(join(cwd, 'file'), 'original');
    await writeFile(join(cwd, 'other'), 'retained');
    await ownership.run(lease, async () => {
      const written = ownership.write(lease, 'file', 'edited', { expectedHash: sha256('original') });
      const removed = assert.rejects(ownership.remove(lease, 'file', { expectedHash: sha256('original') }),
        { code: 'PREIMAGE_MISMATCH' });
      await Promise.all([written, removed]);
      await assert.rejects(ownership.remove(lease, 'other', { expectedHash: sha256('retained') }), { code: 'OUT_OF_SCOPE' });
    });
    assert.equal(await readFile(join(cwd, 'file'), 'utf8'), 'edited');
    assert.equal(await readFile(join(cwd, 'other'), 'utf8'), 'retained');
  } finally {
    await ownership.drain(lease);
    await rm(cwd, { recursive: true, force: true });
  }
});
