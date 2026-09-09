import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createSeatbeltProfile } from '../../../dot_pi/agent/runtime/seatbelt.mjs';

test('Seatbelt profile grants writes only to a private workspace and dev null', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-seatbelt-profile-'));
  try {
    const workspace = join(root, 'work');
    await mkdir(workspace, { mode: 0o700 });
    const canonical = await realpath(workspace);
    const profile = await createSeatbeltProfile({ workspace, readPaths: [process.execPath] });
    assert.ok(profile.startsWith('(version 1)\n(deny default)\n'));
    const writes = profile.split('\n').filter(line => line.startsWith('(allow file-write'));
    assert.deepEqual(writes, [`(allow file-write* (subpath "${canonical}"))`, '(allow file-write-data (literal "/dev/null"))']);
    assert.ok(profile.includes(`(literal "${await realpath(process.execPath)}")`));
    assert.doesNotMatch(profile, /\(allow (?:default|network|mach|appleevent|ipc|lsopen)/u);
    await chmod(workspace, 0o755);
    await assert.rejects(createSeatbeltProfile({ workspace }), /private directory/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
