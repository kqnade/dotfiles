import assert from 'node:assert/strict';
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';

const execute = promisify(execFile);

test('Darwin Seatbelt confines staged writes to the workspace', {
  skip: process.platform === 'darwin' ? false : 'requires macOS Seatbelt',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-seatbelt-runtime-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  const originalPath = join(cwd, 'source.txt');
  const unreadablePath = join(cwd, 'ungranted.txt');
  const createdPath = join(cwd, 'created.txt');
  const renamedPath = join(cwd, 'renamed.txt');
  let ownership;
  let lease;
  try {
    await mkdir(cwd, { mode: 0o700 });
    await mkdir(temporaryRoot, { mode: 0o700 });
    await writeFile(originalPath, 'original\n', { mode: 0o600 });
    await writeFile(unreadablePath, 'private\n', { mode: 0o600 });
    const before = await lstat(originalPath);

    ownership = new Ownership({ cwd });
    lease = ownership.claim('seatbelt-runtime-test', ['source.txt']);
    const result = await runStagedProcess({
      ownership,
      lease,
      cwd,
      files: ['source.txt'],
      temporaryRoot,
      command: '/bin/sh',
      args: ['-c', [
        'set -eu',
        'printf "%s\\n" staged > source.txt',
        '/bin/cat source.txt',
        '/bin/cat "$1" > /dev/null',
        'if /bin/cat "$4" > /dev/null; then printf "%s\\n" ungranted-read-succeeded; else printf "%s\\n" ungranted-read-denied; fi',
        'if printf append >> "$1"; then printf "%s\\n" append-succeeded; else printf "%s\\n" append-denied; fi',
        'if printf created > "$2"; then printf "%s\\n" create-succeeded; else printf "%s\\n" create-denied; fi',
        'if /bin/mv "$1" "$3"; then printf "%s\\n" rename-succeeded; else printf "%s\\n" rename-denied; fi',
        'if /bin/rm "$1"; then printf "%s\\n" unlink-succeeded; else printf "%s\\n" unlink-denied; fi',
        'if /bin/ln "$1" hardlink.txt; then printf "%s\\n" hardlink-succeeded; else printf "%s\\n" hardlink-denied; fi',
        '/bin/rm -f hardlink.txt source.txt',
        'if /bin/ln -s "$1" source.txt; then printf "%s\\n" symlink-created; else printf "%s\\n" symlink-create-failed; fi',
        'if printf linked > source.txt; then printf "%s\\n" symlink-write-succeeded; else printf "%s\\n" symlink-write-denied; fi',
        'printf "%s\\n" SEATBELT_OK',
      ].join('\n'), 'seatbelt-runtime', originalPath, createdPath, renamedPath, unreadablePath],
      readPaths: [originalPath],
      timeoutMs: 5_000,
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, [
      'staged',
      'ungranted-read-denied',
      'append-denied',
      'create-denied',
      'rename-denied',
      'unlink-denied',
      'hardlink-denied',
      'symlink-created',
      'symlink-write-denied',
      'SEATBELT_OK',
      '',
    ].join('\n'));
    assert.deepEqual(await readFile(originalPath), Buffer.from('original\n'));
    const after = await lstat(originalPath);
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino);
    await assert.rejects(access(createdPath), { code: 'ENOENT' });
    await assert.rejects(access(renamedPath), { code: 'ENOENT' });
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    try {
      if (lease !== undefined) await ownership.drain(lease);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('Darwin Seatbelt denies host shared memory and Mach lookup and closes parent file descriptors', {
  skip: process.platform === 'darwin' ? false : 'requires macOS Seatbelt',
  timeout: 20_000,
}, async () => {
  const root = await mkdtemp('/private/tmp/pi-seatbelt-deputies-');
  const cwd = join(root, 'repo');
  const executable = join(root, 'probe');
  const shmName = `/pi-test-${process.pid}-${Date.now()}`;
  let memoryCreated = false;
  let ownership;
  let lease;
  let original;
  try {
    await mkdir(cwd);
    const target = join(cwd, 'source.txt');
    await writeFile(target, 'original');
    original = await open(target, 'r+');
    assert.equal((await original.write('original', 0, 'utf8')).bytesWritten, 8);
    await execute('/usr/bin/cc', ['-Wall', '-Wextra', '-Werror',
      fileURLToPath(new URL('fixtures/seatbelt-probe.c', import.meta.url)), '-o', executable]);
    await execute(executable, ['shm-create', shmName]);
    memoryCreated = true;
    ownership = new Ownership({ cwd });
    lease = ownership.claim('deputy-test', ['source.txt']);
    for (const args of [['shm', shmName], ['mach', 'com.apple.cfprefsd.daemon']]) {
      assert.equal((await execute(executable, args)).stdout, 'connected\n');
      const result = await runStagedProcess({
        ownership, lease, cwd, files: ['source.txt'], temporaryRoot: root,
        command: executable, args, timeoutMs: 5000,
      });
      assert.equal(result.stdout, 'denied\n', `${args[0]} must reject host access`);
      assert.equal((await execute(executable, args)).stdout, 'connected\n');
    }
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['source.txt'], temporaryRoot: root,
      command: executable, args: ['fd', String(original.fd)], timeoutMs: 5000,
    });
    assert.equal(result.stdout, 'closed\n');
    assert.equal(await readFile(target, 'utf8'), 'original');
  } finally {
    if (lease) await ownership.drain(lease);
    if (original) await original.close();
    if (memoryCreated) await execute(executable, ['shm-remove', shmName]);
    await rm(root, { recursive: true, force: true });
  }
});

test('Darwin Seatbelt denies host sockets and detached original writes', {
  skip: process.platform === 'darwin' ? false : 'requires macOS Seatbelt',
  timeout: 20_000,
}, async () => {
  const root = await mkdtemp('/private/tmp/pi-seatbelt-ipc-');
  const cwd = join(root, 'repo');
  const executable = join(root, 'probe');
  const servers = [];
  let ownership;
  let lease;
  try {
    await mkdir(cwd);
    await writeFile(join(cwd, 'source.txt'), 'original');
    await execute('/usr/bin/cc', ['-Wall', '-Wextra', '-Werror',
      fileURLToPath(new URL('fixtures/seatbelt-probe.c', import.meta.url)), '-o', executable]);
    ownership = new Ownership({ cwd });
    lease = ownership.claim('ipc-test', ['source.txt']);
    for (const transport of ['tcp', 'unix']) {
      const server = createServer(socket => socket.end());
      servers.push(server);
      const address = transport === 'tcp' ? { host: '127.0.0.1', port: 0 } : join(root, 'host.sock');
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(address, resolve);
      });
      const endpoint = transport === 'tcp' ? String(server.address().port) : address;
      const args = [transport, endpoint];
      assert.equal((await execute(executable, args)).stdout, 'connected\n');
      const result = await runStagedProcess({
        ownership, lease, cwd, files: ['source.txt'], temporaryRoot: root,
        command: executable, args, timeoutMs: 5000,
      });
      assert.equal(result.stdout, 'denied\n', `${transport} must reject host access`);
    }
    const result = await runStagedProcess({
      ownership, lease, cwd, files: ['source.txt'], temporaryRoot: root,
      command: executable, args: ['detached', join(cwd, 'source.txt')], timeoutMs: 5000,
    });
    assert.equal(result.stdout, 'detached-write-denied\n');
    assert.equal(await readFile(join(cwd, 'source.txt'), 'utf8'), 'original');
  } finally {
    if (lease) await ownership.drain(lease);
    await Promise.all(servers.map(server => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
    await rm(root, { recursive: true, force: true });
  }
});
