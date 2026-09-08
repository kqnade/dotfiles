import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');

test('a canonical scoped claim can perform an expected-hash atomic write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'note.js');
    await mkdir(project);
    await writeFile(target, 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);

    assert.equal(lease.owner, 'writer');
    assert.equal(lease.generation, 1);
    assert.deepEqual(lease.paths, [await realpath(project)]);

    await ownership.run(lease, async () => {
      await ownership.write(lease, 'project/note.js', 'after\n', {
        expectedHash: hash('before\n'),
      });
    });

    assert.equal(await readFile(target, 'utf8'), 'after\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
