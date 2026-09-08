import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scopes } from '../../../dot_pi/agent/runtime/scopes.mjs';
import { resolveSkillResources } from '../../../dot_pi/agent/runtime/skills.mjs';
import { createManagedSkills } from './fixtures/managed-skills.mjs';

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

test('a scoped edit refuses an ambiguous match without changing the file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-scoped-edit-ambiguous-'));
  try {
    await writeFile(join(cwd, 'a.txt'), 'value\nvalue\n');
    const scopes = new Scopes({ cwd, rootId: 'root' });
    const original = await scopes.read('root', 'a.txt');
    await assert.rejects(scopes.edit('root', 'a.txt', 'value', 'replacement', { expectedHash: original.hash }), /unique/);
    assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), original.text);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('scoped reads allow only retained immutable skill resources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-scopes-skills-'));
  const cwd = join(root, 'repo');
  const skillsRoot = join(root, '.agents', 'skills');
  try {
    await mkdir(cwd);
    await createManagedSkills(skillsRoot);
    const resources = await resolveSkillResources({ skillsRoot });
    const scopes = new Scopes({ cwd, rootId: 'root', skillResources: resources.resourcePaths });

    const skill = await scopes.read('root', resources.skillPaths[0]);
    assert.match(skill.text, /fixture skill/u);
    assert.equal(skill.path, resources.skillPaths[0]);

    const retired = join(skillsRoot, 'retired', 'SKILL.md');
    await mkdir(join(skillsRoot, 'retired'), { recursive: true });
    await writeFile(retired, 'retired skill\n');
    await assert.rejects(scopes.read('root', retired), /outside the repository or managed skill resources/u);

    const outside = join(root, 'outside.txt');
    const escaped = join(skillsRoot, 'test-driven-development', 'escaped.md');
    await writeFile(outside, 'outside\n');
    await symlink(outside, escaped);
    await assert.rejects(scopes.read('root', escaped), /outside the repository or managed skill resources/u);

    await assert.rejects(
      scopes.write('root', resources.skillPaths[0], 'modified', { expectedHash: null }),
      /outside ownership cwd/u,
    );
    assert.match(await readFile(resources.skillPaths[0], 'utf8'), /fixture skill/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
