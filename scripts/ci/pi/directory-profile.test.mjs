import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/directory-profile.py', import.meta.url));

test('macOS directory profiles identify the native volume and agree with actual case lookup', {
  skip: process.platform !== 'darwin' && 'requires macOS volume attributes',
}, async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-directory-profile-')));
  try {
    const child = join(parent, 'child');
    await mkdir(child);
    await writeFile(join(parent, 'MixedCase'), 'sentinel');
    let caseSensitive;
    try { await access(join(parent, 'mixedcase')); caseSensitive = false; }
    catch (error) { if (error.code !== 'ENOENT') throw error; caseSensitive = true; }
    const { stdout } = await execute('/usr/bin/python3', ['-B', '-I', '-c', `
import json, os, runpy, sys
profile = runpy.run_path(sys.argv[1])["directory_profile"]
profiles = []
for path in sys.argv[2:]:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        profiles.append(profile(fd))
    finally:
        os.close(fd)
print(json.dumps(profiles))
`, helper, parent, child]);
    const [profile, childProfile] = JSON.parse(stdout);
    assert.ok(profile, 'directory profile is required');
    assert.deepEqual(Object.keys(profile).sort(), [
      'case_preserving', 'case_sensitive', 'device', 'filesystem', 'subtype', 'volume',
    ]);
    assert.equal(profile.case_sensitive, caseSensitive);
    assert.equal(profile.case_preserving, true);
    assert.equal(profile.device, String((await stat(parent)).dev));
    assert.ok(['apfs', 'hfs'].includes(profile.filesystem));
    assert.ok(Number.isInteger(profile.subtype));
    assert.match(profile.volume, /^[0-9a-f]{32}$/);
    assert.notEqual(profile.volume, '0'.repeat(32));
    assert.deepEqual(childProfile, profile);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
