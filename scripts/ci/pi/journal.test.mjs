import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { begin } from '../../../dot_pi/agent/runtime/journal.mjs';

test('begin records a private current-process marker and confirmed completion removes it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-journal-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-journal-cwd-'));

  try {
    const journal = await begin({ directory, cwd, rootId: 'root' });
    const [markerName] = await readdir(directory);
    const markerPath = join(directory, markerName);
    const marker = JSON.parse(await readFile(markerPath, 'utf8'));

    assert.equal(marker.cwd, await realpath(cwd));
    assert.equal(marker.rootId, 'root');
    assert.equal(marker.pid, process.pid);
    assert.equal(typeof marker.birthIdentity, 'string');
    assert.notEqual(marker.birthIdentity, '');
    assert.deepEqual(marker.jobs, {});
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(markerPath)).mode & 0o777, 0o600);

    await journal.complete({ allStopped: true });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('update persists only controlled job metadata and completion requires all stops', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-journal-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-journal-cwd-'));

  try {
    const journal = await begin({
      directory,
      cwd,
      rootId: 'root',
      identity: async () => 'current-birth',
    });
    await journal.update({
      id: 'job-1',
      pid: process.pid,
      role: 'astra',
      paths: ['src', 'README.md'],
      state: 'running',
    });

    const [markerName] = await readdir(directory);
    const markerPath = join(directory, markerName);
    const marker = JSON.parse(await readFile(markerPath, 'utf8'));
    assert.deepEqual(marker.jobs, {
      'job-1': {
        id: 'job-1',
        pid: process.pid,
        role: 'astra',
        paths: ['src', 'README.md'],
        state: 'running',
      },
    });
    await assert.rejects(journal.complete(), /all stops must be confirmed/);
    assert.equal((await readdir(directory)).length, 1);

    await journal.complete({ allStopped: true });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a dead unresolved marker is preserved and refuses a new session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-journal-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-journal-cwd-'));
  const markerPath = join(directory, '.pi-supervisor-dead.json');
  const deadMarker = {
    cwd: await realpath(cwd),
    rootId: 'dead-root',
    pid: 999999,
    birthIdentity: 'dead-birth',
    jobs: {},
  };

  try {
    await writeFile(markerPath, `${JSON.stringify(deadMarker)}\n`, { mode: 0o600 });
    await chmod(markerPath, 0o600);
    await assert.rejects(
      begin({
        directory,
        cwd,
        rootId: 'new-root',
        identity: async (pid) => pid === process.pid ? 'current-birth' : null,
      }),
      /unresolved marker/,
    );
    assert.deepEqual(JSON.parse(await readFile(markerPath, 'utf8')), deadMarker);
    assert.deepEqual(await readdir(directory), ['.pi-supervisor-dead.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a matching active process identity permits another root session in the same cwd', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-journal-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-journal-cwd-'));
  const identity = async () => 'current-birth';

  try {
    const first = await begin({ directory, cwd, rootId: 'first-root', identity });
    const second = await begin({ directory, cwd, rootId: 'second-root', identity });
    assert.equal((await readdir(directory)).length, 2);
    await first.complete({ allStopped: true });
    await second.complete({ allStopped: true });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('completion fences concurrent updates before removing its marker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-journal-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-journal-cwd-'));

  try {
    const journal = await begin({
      directory,
      cwd,
      rootId: 'root',
      identity: async () => 'current-birth',
    });
    const update = journal.update({
      id: 'job-1',
      pid: process.pid,
      role: 'astra',
      paths: [],
      state: 'running',
    });
    const completion = journal.complete({ allStopped: true });

    await assert.rejects(
      journal.update({
        id: 'job-2',
        pid: process.pid,
        role: 'sol',
        paths: [],
        state: 'running',
      }),
      /journal is complete/,
    );
    await Promise.all([update, completion]);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a marker from another live supervisor with matching birth identity is allowed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-journal-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-journal-cwd-'));
  const modulePath = fileURLToPath(new URL('../../../dot_pi/agent/runtime/journal.mjs', import.meta.url));
  const source = [
    `import { begin } from ${JSON.stringify(modulePath)};`,
    `await begin({ directory: ${JSON.stringify(directory)}, cwd: ${JSON.stringify(cwd)}, rootId: 'child-root' });`,
    "process.stdout.write('ready\\n');",
    'setInterval(() => {}, 1000);',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const childClosed = new Promise((resolve) => child.once('close', resolve));
  const ready = new Promise((resolve, reject) => {
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const line = output.split('\n', 1)[0];
      if (line === 'ready') resolve();
    });
    child.once('error', reject);
    child.once('close', (code) => reject(new Error(`child exited before ready (${code})`)));
  });

  try {
    await ready;
    const journal = await begin({ directory, cwd, rootId: 'parent-root' });
    assert.equal((await readdir(directory)).length, 2);
    await journal.complete({ allStopped: true });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await childClosed;
    await rm(directory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});
