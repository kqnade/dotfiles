import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/validate-tree.py', import.meta.url));

const validate = (baseline, projected) => execute('/usr/bin/python3', ['-B', '-I', '-c', `
import runpy, sys
validate = runpy.run_path(sys.argv[1])["validate_projected_links"]
validate(sys.argv[2], sys.argv[3])
print("accepted")
`, helper, baseline, projected]);

test('existing external link survives ordinary projected file changes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-stable-'));
  const outside = join(parent, 'outside');
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await writeFile(outside, 'sentinel');
    await writeFile(join(baseline, 'file'), 'original');
    await symlink('../outside', join(baseline, 'alias'));
    await writeFile(join(projected, 'file'), 'changed');
    await symlink('../outside', join(projected, 'alias'));
    const { stdout, stderr } = await validate(baseline, projected);
    assert.equal(stdout, 'accepted\n');
    assert.equal(stderr, '');
    assert.equal(await readFile(outside, 'utf8'), 'sentinel');
    assert.equal(await readFile(join(baseline, 'file'), 'utf8'), 'original');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('added escaping link is rejected', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-added-'));
  const outside = join(parent, 'outside');
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await writeFile(outside, 'sentinel');
    await writeFile(join(baseline, 'file'), 'baseline');
    await writeFile(join(projected, 'file'), 'projected');
    await symlink('../outside', join(projected, 'a'));
    await assert.rejects(validate(baseline, projected), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /projected link escapes validation root: a/);
      return true;
    });
    assert.equal(await readFile(outside, 'utf8'), 'sentinel');
    assert.equal(await readFile(join(projected, 'file'), 'utf8'), 'projected');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('changed escaping target is rejected even with retained path', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-escape-change-'));
  const baselineOutside = join(parent, 'outside');
  const projectedOutside = join(parent, 'outside2');
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await writeFile(baselineOutside, 'sentinel');
    await writeFile(projectedOutside, 'sentinel');
    await symlink('../outside', join(baseline, 'a'));
    await symlink('../outside2', join(projected, 'a'));
    await assert.rejects(validate(baseline, projected), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /projected link escapes validation root: a/);
      return true;
    });
    assert.equal(await readFile(baselineOutside, 'utf8'), 'sentinel');
    assert.equal(await readFile(projectedOutside, 'utf8'), 'sentinel');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('retained dangling link becomes contained and is accepted', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-dangling-contained-'));
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await symlink('missing', join(baseline, 'a'));
    await symlink('missing', join(projected, 'a'));
    await writeFile(join(projected, 'missing'), 'target');
    const { stdout, stderr } = await validate(baseline, projected);
    assert.equal(stdout, 'accepted\n');
    assert.equal(stderr, '');
    assert.equal(await readFile(join(projected, 'missing'), 'utf8'), 'target');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('retained dangling link becomes escaping after target is added and is rejected', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-dangling-escape-'));
  const outside = join(parent, 'outside');
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await writeFile(outside, 'sentinel');
    await symlink('slot', join(baseline, 'a'));
    await symlink('slot', join(projected, 'a'));
    await symlink('../outside', join(projected, 'slot'));
    await assert.rejects(validate(baseline, projected), error => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /projected link escapes validation root: a/);
      return true;
    });
    await assert.rejects(readFile(join(baseline, 'a'), 'utf8'), { code: 'ENOENT' });
    assert.equal(await readFile(outside, 'utf8'), 'sentinel');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('removed external symlink is accepted', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-removed-'));
  const outside = join(parent, 'outside');
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await writeFile(outside, 'sentinel');
    await symlink('../outside', join(baseline, 'a'));
    const { stdout, stderr } = await validate(baseline, projected);
    assert.equal(stdout, 'accepted\n');
    assert.equal(stderr, '');
    assert.equal(await readFile(outside, 'utf8'), 'sentinel');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('external symlink type replacement is accepted', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-projected-links-replaced-'));
  const outside = join(parent, 'outside');
  const baseline = join(parent, 'baseline');
  const projected = join(parent, 'projected');
  try {
    await mkdir(baseline);
    await mkdir(projected);
    await writeFile(outside, 'sentinel');
    await symlink('../outside', join(baseline, 'a'));
    await writeFile(join(projected, 'a'), 'replacement file');
    const { stdout, stderr } = await validate(baseline, projected);
    assert.equal(stdout, 'accepted\n');
    assert.equal(stderr, '');
    assert.equal(await readFile(outside, 'utf8'), 'sentinel');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
