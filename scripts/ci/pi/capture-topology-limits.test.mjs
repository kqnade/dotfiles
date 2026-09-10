import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/capture-tree.py', import.meta.url));

const captureTopology = (root, maxBytes, maxEntries, maxMetadataBytes) => execute('/usr/bin/python3', ['-B', '-I', '-c', `
import json, runpy, sys
capture_tree = runpy.run_path(sys.argv[1])["capture_tree"]
print(json.dumps(capture_tree(
    sys.argv[2],
    max_bytes=int(sys.argv[3]),
    max_entries=int(sys.argv[4]),
    max_metadata_bytes=int(sys.argv[5]),
    topology_only=True,
)))
`, helper, root, String(maxBytes), String(maxEntries), String(maxMetadataBytes)], { timeout: 3000 });

const metadataBytes = async records => {
  const { stdout } = await execute('/usr/bin/python3', ['-B', '-I', '-c', `
import json, sys
records = json.loads(sys.argv[1])
print(sum(len(json.dumps(record).encode('ascii')) for record in records))
`, JSON.stringify(records)]);
  return Number(stdout.trim());
};

test('topology capture accepts max_entries at exact boundary and rejects one entry over limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-topology-entries-'));
  const expected = [
    { path: 'a', type: 'file', mode: 0o644 },
    { path: 'dir', type: 'directory', mode: 0o755 },
    { path: 'dir/b', type: 'file', mode: 0o600 },
  ];

  try {
    await mkdir(join(root, 'dir'), { mode: 0o755 });
    await writeFile(join(root, 'a'), 'contents', { mode: 0o644 });
    await writeFile(join(root, 'dir', 'b'), 'node', { mode: 0o600 });
    await chmod(join(root, 'dir'), 0o755);
    await chmod(join(root, 'a'), 0o644);
    await chmod(join(root, 'dir/b'), 0o600);

    const { stdout } = await captureTopology(root, 0, 3, 1_000_000);
    assert.deepEqual(JSON.parse(stdout), expected);

    await assert.rejects(
      captureTopology(root, 0, 2, 1_000_000),
      error => {
        assert.equal(error.stdout, '');
        assert.match(error.stderr, /capture entry limit exceeded/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('topology capture accepts exact max_metadata_bytes and rejects one byte over', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-topology-metadata-'));
  const expected = [
    { path: 'file', type: 'file', mode: 0o644 },
    { path: 'link', type: 'symlink', target: 'file' },
  ];

  try {
    await writeFile(join(root, 'file'), 'body', { mode: 0o644 });
    await chmod(join(root, 'file'), 0o644);
    await symlink('file', join(root, 'link'));

    const boundary = await metadataBytes(expected);
    const { stdout } = await captureTopology(root, 0, 100_000, boundary);
    assert.deepEqual(JSON.parse(stdout), expected);

    await assert.rejects(
      captureTopology(root, 0, 100_000, boundary - 1),
      error => {
        assert.equal(error.stdout, '');
        assert.match(error.stderr, /capture metadata limit exceeded/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('topology capture rejects static FIFOs with no partial stdout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-topology-fifo-'));
  try {
    await execute('/usr/bin/python3', ['-B', '-I', '-c', `
import os, sys
os.mkfifo(sys.argv[1])
`, join(root, 'pipe')]);

    await assert.rejects(
      captureTopology(root, 0, 100_000, 1_000_000),
      error => {
        assert.equal(error.stdout, '');
        assert.match(error.stderr, /unsupported capture entry: pipe/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
