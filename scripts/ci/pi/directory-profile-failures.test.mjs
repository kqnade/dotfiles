import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/directory-profile.py', import.meta.url));

const profileByHex = async ({ hex }) => {
  const command = `
import runpy, sys
import json

decode = runpy.run_path(sys.argv[1])["decode_volume_profile"]
raw = bytes.fromhex(sys.argv[2])
decode(raw)
print(json.dumps("ok"))
`;
  return execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper, hex]);
};

const buildProfileFixture = ({
  size = 128,
  capabilities = 0x300,
  uuid = Buffer.alloc(16, 0x11),
  nameOffset = 12,
  name = 'apfs',
  nameLength = name.length + 1,
}) => {
  const raw = Buffer.alloc(size);
  raw.writeUInt32LE(size, 0);
  raw.writeUInt32LE(capabilities, 20);
  if (uuid.length !== 16) throw new Error('uuid must be 16 bytes');
  uuid.copy(raw, 36);
  raw.writeInt32LE(nameOffset, 52);
  raw.writeUInt32LE(nameLength, 56);
  raw.writeUInt32LE(1, 60);
  const bytes = Buffer.from(name);
  raw.set(bytes, 64);
  if (nameLength > bytes.length) {
    raw[64 + nameLength - 1] = 0;
  }
  return raw.toString('hex');
};

for (const [label, hex, expected] of [
  [
    'truncated payload',
    Buffer.alloc(63).toString('hex'),
    /truncated/,
  ],
  [
    'out-of-bounds name reference',
    buildProfileFixture({ size: 80, nameLength: 32 }),
    /bounds are invalid/,
  ],
  [
    'unterminated type name',
    buildProfileFixture({ size: 96, nameLength: 4, name: 'apfs' }),
    /filesystem type name is invalid/,
  ],
  [
    'missing case-preserving/case-sensitive capability',
    buildProfileFixture({ capabilities: 0x100 }),
    /name-lookup metadata is unavailable/,
  ],
  [
    'zero UUID',
    buildProfileFixture({ uuid: Buffer.alloc(16) }),
    /name-lookup metadata is unavailable/,
  ],
]) {
  test(`decode_volume_profile rejects ${label}`, async () => {
    await assert.rejects(profileByHex({ hex }), (failure) => {
      assert.equal(failure.stdout, '');
      assert.match(failure.stderr, expected);
      return true;
    });
  });
}

test('directory_profile refuses an unsupported platform before reading descriptors', async () => {
  const command = `
import runpy, sys

directory_profile = runpy.run_path(sys.argv[1])["directory_profile"]
sys.platform = "unsupported"
directory_profile(-1)
`;
  await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper]), (error) => {
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /not supported on this platform/);
    return true;
  });
});

test('directory_profile requires a directory descriptor on Darwin', { skip: process.platform !== 'darwin' && 'requires macOS support' }, async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'pi-directory-profile-native-')));
  const file = join(parent, 'payload');
  try {
    await writeFile(file, 'regular-file');
    const command = `
import os, runpy, sys

directory_profile = runpy.run_path(sys.argv[1])["directory_profile"]
fd = os.open(sys.argv[2], os.O_RDONLY)
try:
    directory_profile(fd)
finally:
    os.close(fd)
`;
    await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper, file]), (error) => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /directory profile requires a directory descriptor/);
      return true;
    });
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
});

test('directory_profile rejects bad file descriptors on Darwin', { skip: process.platform !== 'darwin' && 'requires macOS support' }, async () => {
  const command = `
import runpy, sys

directory_profile = runpy.run_path(sys.argv[1])["directory_profile"]
directory_profile(-1)
`;
  await assert.rejects(execute('/usr/bin/python3', ['-B', '-I', '-c', command, helper]), (error) => {
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /Bad file descriptor/);
    return true;
  });
});
