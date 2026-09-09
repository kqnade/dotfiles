import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/directory-profile.py', import.meta.url));

test('destination validation rejects different native metadata in an existing nested directory', {
  skip: process.platform !== 'darwin' && 'requires macOS directory profiles',
}, async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-destination-profile-')));
  try {
    const destination = join(parent, 'destination');
    const validation = join(parent, 'validation');
    await mkdir(join(destination, 'nested'), { recursive: true });
    await mkdir(join(validation, 'nested'), { recursive: true });
    await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', '-c', `
import os, runpy, sys
module = runpy.run_path(sys.argv[1])
validate = module["validate_destination_profiles"]
native_profile = module["directory_profile"]
nested_inode = os.stat(os.path.join(sys.argv[2], "nested")).st_ino
def different_nested_volume(fd):
    profile = native_profile(fd)
    if os.fstat(fd).st_ino == nested_inode:
        profile["volume"] = "f" * 32
    return profile
validate.__globals__["directory_profile"] = different_nested_volume
destination_fd = os.open(sys.argv[2], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
validation_fd = os.open(sys.argv[3], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    validate(destination_fd, validation_fd)
    print("accepted")
finally:
    os.close(validation_fd)
    os.close(destination_fd)
`, helper, destination, validation]), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /destination and validation name-lookup profiles differ/);
      return true;
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
