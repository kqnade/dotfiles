import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { Ownership, stopProcessGroup } from '../../../dot_pi/agent/runtime/ownership.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');

test('process group stop waits for an uncertain inspection to confirm disappearance', async t => {
  let empty = false;
  let settled = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    assert.equal(pid, -424242);
    assert.equal(signal, 0);
    throw Object.assign(new Error('inspection result'), { code: empty ? 'ESRCH' : 'EPERM' });
  });
  const stopping = stopProcessGroup(424242, 1000).then(
    () => { settled = true; return {}; },
    error => { settled = true; return { error }; },
  );
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(settled, false);
  empty = true;
  assert.deepEqual(await stopping, {});
});

test('process group stop confirms disappearance after a denied termination signal', async t => {
  let terminating = false;
  let checkedAfterSignal = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    assert.equal(pid, -424242);
    if (signal === 0 && !terminating) return true;
    if (signal === 'SIGTERM') {
      terminating = true;
      throw Object.assign(new Error('group is exiting'), { code: 'EPERM' });
    }
    assert.equal(signal, 0);
    checkedAfterSignal = true;
    throw Object.assign(new Error('group is absent'), { code: 'ESRCH' });
  });
  await stopProcessGroup(424242, 1000);
  assert.equal(checkedAfterSignal, true);
});

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

test('concurrent writes on one ownership serialize compare-and-swap publication', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-ownership-write-serialization-')));
  try {
    const project = join(root, 'project');
    const target = join(project, 'note.js');
    await mkdir(project);
    await writeFile(target, 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);
    const originalRename = fs.promises.rename;
    let renameCalls = 0;
    let firstRenameStartedResolve;
    const firstRenameStarted = new Promise((resolve) => {
      firstRenameStartedResolve = resolve;
    });
    let releaseFirstResolve;
    const firstPublication = new Promise((resolve) => {
      releaseFirstResolve = resolve;
    });
    let attemptsStarted = 0;
    let bothAttemptsStartedResolve;
    const bothAttemptsStarted = new Promise((resolve) => {
      bothAttemptsStartedResolve = resolve;
    });
    const markAttemptStarted = () => {
      attemptsStarted += 1;
      if (attemptsStarted === 2) {
        bothAttemptsStartedResolve();
      }
    };

    let results;
    try {
      fs.promises.rename = async (source, destination) => {
        if (destination === target) {
          renameCalls += 1;
          if (renameCalls === 1) {
            firstRenameStartedResolve();
            await firstPublication;
          }
        }
        return originalRename(source, destination);
      };
      syncBuiltinESMExports();
      const expectedHash = hash('before\n');
      const first = ownership.run(lease, async () => {
        markAttemptStarted();
        return ownership.write(lease, 'project/note.js', 'first\n', { expectedHash });
      }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
      );
      const second = ownership.run(lease, async () => {
        markAttemptStarted();
        return ownership.write(lease, 'project/note.js', 'second\n', { expectedHash });
      }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
      );

      await bothAttemptsStarted;
      await firstRenameStarted;
      releaseFirstResolve();
      results = await Promise.all([first, second]);
    } finally {
      releaseFirstResolve();
      fs.promises.rename = originalRename;
      syncBuiltinESMExports();
    }

    assert.equal(renameCalls, 1);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'PREIMAGE_MISMATCH');
    assert.equal(await readFile(target, 'utf8'), 'first\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a create-only write publishes an absent target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-create-only-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'new.js');
    await mkdir(project);

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);

    await ownership.run(lease, async () => {
      await ownership.write(lease, 'project/new.js', 'created\n', {
        expectedHash: null,
      });
    });

    assert.equal(await readFile(target, 'utf8'), 'created\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a create-only write rejects an existing target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-create-only-existing-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'existing.js');
    await mkdir(project);
    await writeFile(target, 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);

    await assert.rejects(
      ownership.run(lease, async () => ownership.write(lease, 'project/existing.js', 'after\n', {
        expectedHash: null,
      })),
      { code: 'PREIMAGE_MISMATCH' },
    );
    assert.equal(await readFile(target, 'utf8'), 'before\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a create-only write rejects a target created before publication', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-ownership-create-only-collision-')));
  try {
    const project = join(root, 'project');
    const target = join(project, 'race.js');
    await mkdir(project);

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);
    const originalLink = fs.promises.link;
    let collisionCreated = false;
    let result;
    try {
      fs.promises.link = async (source, destination) => {
        assert.equal(destination, target);
        await writeFile(target, 'external\n', { flag: 'wx' });
        collisionCreated = true;
        return originalLink(source, destination);
      };
      syncBuiltinESMExports();
      const running = ownership.run(lease, async () => ownership.write(
        lease,
        'project/race.js',
        'writer\n',
        { expectedHash: null },
      )).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason }),
      );
      result = await running;
    } finally {
      fs.promises.link = originalLink;
      syncBuiltinESMExports();
    }
    assert.equal(collisionCreated, true);
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'PREIMAGE_MISMATCH');
    assert.equal(await readFile(target, 'utf8'), 'external\n');
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

test('renew rotates a drained lease without taking a snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-renew-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'note.js');
    await mkdir(project);
    await writeFile(target, 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', ['project']);
    assert.throws(() => ownership.renew(lease), { code: 'NOT_DRAINED' });
    await ownership.drain(lease);

    const renewed = ownership.renew(lease);
    assert.equal(renewed.owner, 'writer');
    assert.equal(renewed.generation, 2);
    assert.deepEqual(renewed.paths, lease.paths);
    assert.equal(Object.hasOwn(renewed, 'snapshots'), false);
    await assert.rejects(
      async () => ownership.run(lease, async () => {}),
      { code: 'STALE_LEASE' },
    );
    await ownership.run(renewed, async () => {
      await ownership.write(renewed, 'project/note.js', 'after\n', {
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

test('runProcess waits for a delayed direct child and returns its stdio', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-process-'));
  try {
    const project = join(root, 'project');
    await mkdir(project);
    await writeFile(join(project, 'note.js'), 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);
    const script = [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => setTimeout(() => process.stdout.write(input.toUpperCase()), 20));",
    ].join('');

    const result = await ownership.runProcess(lease, {
      command: process.execPath,
      args: ['-e', script],
      stdin: 'format me\n',
    });

    assert.deepEqual(result, {
      stdout: 'FORMAT ME\n',
      stderr: '',
      code: 0,
      signal: null,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runProcess abort escalates a SIGTERM-ignoring child and settles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-abort-'));
  try {
    const project = join(root, 'project');
    await mkdir(project);
    await writeFile(join(project, 'note.js'), 'before\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);
    const controller = new AbortController();
    const ready = join(project, 'ready');
    const script = "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.env.READY_FILE, 'ready'); setInterval(() => {}, 1000);";
    const running = ownership.runProcess(lease, {
      command: process.execPath,
      args: ['-e', script],
      env: { READY_FILE: ready },
      stdin: null,
      signal: controller.signal,
      timeoutMs: 1_000,
    });

    let readySeen = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        readySeen = (await readFile(ready, 'utf8')) === 'ready';
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    assert.equal(readySeen, true);
    controller.abort();
    let failure;
    try {
      await running;
      assert.fail('aborted process unexpectedly succeeded');
    } catch (error) {
      failure = error;
    }
    assert.ok(['ABORT_ERR', 'PROCESS_GROUP_UNKNOWN'].includes(failure.code));
    if (failure.code === 'PROCESS_GROUP_UNKNOWN') {
      await assert.rejects(ownership.transfer(lease, 'delegate'), { code: 'QUARANTINED' });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('transfer records deleted claims and symlinks without following links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-ownership-snapshot-'));
  try {
    const project = join(root, 'project');
    const target = join(project, 'note.js');
    const link = join(project, 'outside-link');
    await mkdir(project);
    await writeFile(target, 'before\n');
    await symlink('../outside.txt', link);
    const canonicalProject = await realpath(project);
    const canonicalTarget = join(canonicalProject, 'note.js');
    const canonicalLink = join(canonicalProject, 'outside-link');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('writer', [target, project]);
    await ownership.drain(lease);
    await rm(target);

    const transferred = await ownership.transfer(lease, 'delegate');
    assert.equal(transferred.snapshots[canonicalTarget], null);
    assert.deepEqual(transferred.snapshots[canonicalLink], {
      type: 'symlink',
      target: '../outside.txt',
      hash: hash('../outside.txt'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
