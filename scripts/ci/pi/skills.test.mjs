import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  RETAINED_SKILL_NAMES,
  resolveSkillResources,
} from '../../../dot_pi/agent/runtime/skills.mjs';
import {
  RETAINED_SKILL_RESOURCES,
  createManagedSkills,
} from './fixtures/managed-skills.mjs';

test('managed skills resolve to exactly six skill files and their read-only closure', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-skills-')));
  const skillsRoot = join(root, '.agents', 'skills');
  try {
    await createManagedSkills(skillsRoot);
    await mkdir(join(skillsRoot, 'retired'), { recursive: true });
    await writeFile(join(skillsRoot, 'retired', 'SKILL.md'), 'retired\n');
    const resolved = await resolveSkillResources({ skillsRoot });

    assert.deepEqual(resolved.skillPaths, RETAINED_SKILL_NAMES.map(name => join(skillsRoot, name, 'SKILL.md')));
    assert.deepEqual(resolved.resourcePaths, RETAINED_SKILL_RESOURCES.map(relativePath => join(skillsRoot, relativePath)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('managed skills reject a retained file whose canonical target escapes the skills root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-skills-escape-'));
  const skillsRoot = join(root, '.agents', 'skills');
  const target = join(skillsRoot, 'evidence-review', 'SKILL.md');
  const outside = join(root, 'outside.md');
  try {
    await createManagedSkills(skillsRoot);
    await writeFile(outside, 'outside\n');
    await rm(target);
    await symlink(outside, target);
    await assert.rejects(
      resolveSkillResources({ skillsRoot }),
      /managed skill resource escapes skillsRoot/u,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('managed skills reject a retained file redirected to a retired sibling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-skills-retired-'));
  const skillsRoot = join(root, '.agents', 'skills');
  const target = join(skillsRoot, 'test-driven-development', 'SKILL.md');
  const retired = join(skillsRoot, 'retired', 'SKILL.md');
  try {
    await createManagedSkills(skillsRoot);
    await mkdir(join(skillsRoot, 'retired'), { recursive: true });
    await writeFile(retired, 'retired\n');
    await rm(target);
    await symlink('../retired/SKILL.md', target);
    await assert.rejects(
      resolveSkillResources({ skillsRoot }),
      /managed skill resource does not match configured path/u,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});
