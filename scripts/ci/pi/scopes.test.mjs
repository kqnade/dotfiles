import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scopes } from '../../../dot_pi/agent/runtime/scopes.mjs';

test('borrowed scopes exclude siblings and block the waiting parent until return', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-scopes-'));
  try {
    await writeFile(join(cwd, 'a.txt'), 'old');
    const scopes = new Scopes({ cwd, rootId: 'root' });
    await scopes.pause('root');
    scopes.borrow('root', 'child', ['a.txt']);
    assert.throws(() => scopes.borrow('root', 'sibling', ['a.txt']), /overlap/);
    await assert.rejects(scopes.write('root', 'a.txt', 'parent'), /draining/);
    await scopes.write('child', 'a.txt', 'child');
    await assert.rejects(scopes.resume('root'), /outstanding/);
    const snapshot = await scopes.finish('child');
    assert.equal(Object.keys(snapshot).length, 1);
    await scopes.resume('root');
    await scopes.write('root', 'a.txt', 'resumed');
    assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'resumed');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a scoped edit replaces a unique preimage and preserves the rest of the file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-scoped-edit-'));
  try {
    await writeFile(join(cwd, 'a.txt'), 'before\nold value\nafter\n');
    const scopes = new Scopes({ cwd, rootId: 'root' });
    const original = await scopes.read('root', 'a.txt');
    const result = await scopes.edit('root', 'a.txt', 'old value', 'new value', { expectedHash: original.hash });
    assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'before\nnew value\nafter\n');
    assert.notEqual(result.hash, original.hash);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
