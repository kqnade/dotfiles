import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/directory-profile.py', import.meta.url));

const requiresDarwin = { skip: process.platform !== 'darwin' && 'requires macOS destination profiles' };

test('destination profile validation accepts existing directories and nested new directories', requiresDarwin, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-destination-profile-'));
  const destination = join(parent, 'destination');
  const validation = join(parent, 'validation');

  try {
    await mkdir(destination);
    await mkdir(validation);
    await mkdir(join(destination, 'nested'));
    await writeFile(join(destination, 'nested', 'sentinel'), 'keep-me');
    await mkdir(join(validation, 'nested'));
    await mkdir(join(validation, 'nested', 'created'), { recursive: true });

    const command = `
import json, os, runpy, sys
module = runpy.run_path(sys.argv[1])
validate = module["validate_destination_profiles"]
destination_fd = os.open(sys.argv[2], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
validation_fd = os.open(sys.argv[3], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    validate(destination_fd, validation_fd)
    print(json.dumps({
        "accepted": True,
        "destination_usable": os.fstat(destination_fd).st_ino != 0,
        "validation_usable": os.fstat(validation_fd).st_ino != 0,
    }))
finally:
    os.close(validation_fd)
    os.close(destination_fd)
`;
    const { stdout } = await execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper, destination, validation]);
    const result = JSON.parse(stdout);
    assert.equal(result.accepted, true);
    assert.equal(result.destination_usable, true);
    assert.equal(result.validation_usable, true);
    assert.equal(await readFile(join(destination, 'nested', 'sentinel'), 'utf8'), 'keep-me');
    await assert.rejects(access(join(destination, 'nested', 'created')), { code: 'ENOENT' });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('destination profile validation treats replaced symlink as new directory and does not follow outside target', requiresDarwin, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-destination-profile-symlink-'));
  const destination = join(parent, 'destination');
  const validation = join(parent, 'validation');
  const outside = join(parent, 'outside');

  try {
    await mkdir(destination);
    await mkdir(validation);
    await mkdir(outside);
    await writeFile(join(outside, 'sentinel'), 'outside');
    await symlink(join('..', 'outside'), join(destination, 'alias'));
    await mkdir(join(validation, 'alias'));

    const command = `
import json, os, runpy, sys
module = runpy.run_path(sys.argv[1])
validate = module["validate_destination_profiles"]
real_profile = module["directory_profile"]
outside_ino = os.stat(sys.argv[4]).st_ino

def guarded_profile(directory_fd):
    profile = real_profile(directory_fd)
    if os.fstat(directory_fd).st_ino == outside_ino:
        profile = dict(profile)
        profile["volume"] = "f" * 32
    return profile

validate.__globals__["directory_profile"] = guarded_profile
destination_fd = os.open(sys.argv[2], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
validation_fd = os.open(sys.argv[3], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    validate(destination_fd, validation_fd)
    print(json.dumps({
        "accepted": True,
        "destination_usable": os.fstat(destination_fd).st_ino != 0,
        "validation_usable": os.fstat(validation_fd).st_ino != 0,
    }))
finally:
    os.close(validation_fd)
    os.close(destination_fd)
`;
    const { stdout } = await execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper, destination, validation, outside]);
    const result = JSON.parse(stdout);
    assert.equal(result.accepted, true);
    assert.equal(result.destination_usable, true);
    assert.equal(result.validation_usable, true);
    assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'outside');
    assert.equal(await readlink(join(destination, 'alias')), '../outside');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('destination profile validation rejects unsupported filesystem metadata', requiresDarwin, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-destination-profile-unsupported-'));
  const destination = join(parent, 'destination');
  const validation = join(parent, 'validation');

  try {
    await mkdir(destination);
    await mkdir(validation);

    const command = `
import os, runpy, sys
module = runpy.run_path(sys.argv[1])
validate = module["validate_destination_profiles"]
real_profile = module["directory_profile"]

def unsupported_profile(directory_fd):
    profile = dict(real_profile(directory_fd))
    profile["filesystem"] = "unsupportedfs"
    return profile

validate.__globals__["directory_profile"] = unsupported_profile
destination_fd = os.open(sys.argv[2], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
validation_fd = os.open(sys.argv[3], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    validate(destination_fd, validation_fd)
finally:
    os.close(validation_fd)
    os.close(destination_fd)
`;
    await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper, destination, validation]), (error) => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /destination filesystem name lookup is not supported/);
      return true;
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
