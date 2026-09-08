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

test('drain waits for a delayed writer and prevents its late write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-drain-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'note.js');
    await mkdir(project);
    await writeFile(target, 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);
    let startedResolve;
    const started = new Promise((resolve) => {
      startedResolve = resolve;
    });
    const running = ownership.run(lease, async () => {
      startedResolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await ownership.write(lease, 'project/note.js', 'late\n', {
        expectedHash: hash('before\n'),
      });
    });

    await started;
    const draining = ownership.drain(lease);
    await assert.rejects(
      async () => ownership.run(lease, async () => {}),
      { code: 'DRAINING' },
    );
    await draining;
    await assert.rejects(running, { code: 'DRAINING' });
    assert.equal(await readFile(target, 'utf8'), 'before\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('transfer snapshots the drained scope and makes the previous lease stale', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-transfer-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'note.js');
    await mkdir(project);
    await writeFile(target, 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);
    await ownership.drain(lease);

    const delegated = await ownership.transfer(lease, 'delegate');
    const canonicalTarget = await realpath(target);
    assert.equal(delegated.lease.owner, 'delegate');
    assert.equal(delegated.lease.generation, 2);
    assert.equal(delegated.snapshots[canonicalTarget], hash('before\n'));
    await assert.rejects(
      async () => ownership.run(lease, async () => {}),
      { code: 'STALE_LEASE' },
    );

    await ownership.drain(delegated.lease);
    const resumed = await ownership.transfer(delegated.lease, 'writer');
    assert.equal(resumed.lease.owner, 'writer');
    assert.equal(resumed.lease.generation, 3);

    await ownership.run(resumed.lease, async () => {
      await ownership.write(resumed.lease, 'project/note.js', 'after\n', {
        expectedHash: hash('before\n'),
      });
    });
    assert.equal(await readFile(target, 'utf8'), 'after\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quarantine makes a lease terminal and prevents transfer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-quarantine-'));
  try {
    const project = join(root, 'project');
    await mkdir(project);
    await writeFile(join(project, 'note.js'), 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);
    const status = ownership.quarantine(lease, 'descendant state is unknown');

    assert.equal(status.owner, 'writer');
    assert.equal(status.generation, 1);
    assert.equal(status.reason, 'descendant state is unknown');
    await assert.rejects(
      async () => ownership.run(lease, async () => {}),
      { code: 'QUARANTINED' },
    );
    await assert.rejects(async () => ownership.drain(lease), { code: 'QUARANTINED' });
    await assert.rejects(
      async () => ownership.transfer(lease, 'delegate'),
      { code: 'QUARANTINED' },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
