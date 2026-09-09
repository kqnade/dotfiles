import assert from 'node:assert/strict';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';

test('Darwin Seatbelt confines staged writes to the workspace', {
  skip: process.platform === 'darwin' ? false : 'requires macOS Seatbelt',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-seatbelt-runtime-'));
  const cwd = join(root, 'repo');
  const temporaryRoot = join(root, 'temporary');
  const originalPath = join(cwd, 'source.txt');
  const createdPath = join(cwd, 'created.txt');
  const renamedPath = join(cwd, 'renamed.txt');
  let ownership;
  let lease;
  try {
    await mkdir(cwd, { mode: 0o700 });
    await mkdir(temporaryRoot, { mode: 0o700 });
    await writeFile(originalPath, 'original\n', { mode: 0o600 });
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
        'if printf append >> "$1"; then printf "%s\\n" append-succeeded; else printf "%s\\n" append-denied; fi',
        'if printf created > "$2"; then printf "%s\\n" create-succeeded; else printf "%s\\n" create-denied; fi',
        'if /bin/mv "$1" "$3"; then printf "%s\\n" rename-succeeded; else printf "%s\\n" rename-denied; fi',
        'if /bin/rm "$1"; then printf "%s\\n" unlink-succeeded; else printf "%s\\n" unlink-denied; fi',
        'if /bin/ln "$1" hardlink.txt; then printf "%s\\n" hardlink-succeeded; else printf "%s\\n" hardlink-denied; fi',
        '/bin/rm -f hardlink.txt source.txt',
        'if /bin/ln -s "$1" source.txt; then printf "%s\\n" symlink-created; else printf "%s\\n" symlink-create-failed; fi',
        'if printf linked > source.txt; then printf "%s\\n" symlink-write-succeeded; else printf "%s\\n" symlink-write-denied; fi',
        'printf "%s\\n" SEATBELT_OK',
      ].join('\n'), 'seatbelt-runtime', originalPath, createdPath, renamedPath],
      readPaths: [originalPath],
      timeoutMs: 5_000,
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, [
      'staged',
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
