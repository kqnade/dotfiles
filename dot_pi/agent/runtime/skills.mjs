import { lstat, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const RETAINED_SKILL_NAMES = Object.freeze([
  'test-driven-development',
  'evidence-review',
  'sanitize-artifacts',
  'using-workflow-skills',
  'context-handoff',
  'todo-management',
]);

const RETAINED_RESOURCE_RELATIVE_PATHS = Object.freeze([
  ...RETAINED_SKILL_NAMES.map(name => `${name}/SKILL.md`),
  'using-workflow-skills/references/persistent-state.md',
  'using-workflow-skills/scripts/ensure-local-dev-ignore',
  'using-workflow-skills/scripts/workflow-state-candidates',
  'using-workflow-skills/scripts/workflow-state-digest',
  'using-workflow-skills/scripts/workflow-state-root',
  'using-workflow-skills/scripts/workflow-state-write',
  'context-handoff/scripts/context-candidates',
  'context-handoff/scripts/context-path',
  'todo-management/scripts/todo-complete',
  'todo-management/scripts/todo-obligation',
  'todo-management/scripts/todo-path',
]);

const within = (parent, child) => {
  const distance = relative(parent, child);
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance));
};

export const defaultSkillsRoot = (env = process.env) => resolve(env.HOME || homedir(), '.agents', 'skills');

export const skillResourcePaths = (skillsRoot = defaultSkillsRoot()) =>
  RETAINED_RESOURCE_RELATIVE_PATHS.map(relativePath => join(resolve(skillsRoot), relativePath));

export const retainedSkillPaths = (skillsRoot = defaultSkillsRoot()) =>
  RETAINED_SKILL_NAMES.map(name => join(resolve(skillsRoot), name, 'SKILL.md'));

export async function resolveSkillResources({ skillsRoot = defaultSkillsRoot() } = {}) {
  if (typeof skillsRoot !== 'string' || skillsRoot.length === 0) {
    throw new TypeError('skillsRoot must be a non-empty string');
  }
  const configuredRoot = resolve(skillsRoot);
  const canonicalRoot = await realpath(configuredRoot);
  if (!(await stat(canonicalRoot)).isDirectory()) throw new Error('skillsRoot must be a directory');

  const resources = [];
  for (const relativePath of RETAINED_RESOURCE_RELATIVE_PATHS) {
    const configuredPath = join(configuredRoot, relativePath);
    const canonicalPath = await realpath(configuredPath).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`managed skill resource is missing: ${configuredPath}`);
      throw error;
    });
    if (!within(canonicalRoot, canonicalPath)) {
      throw new Error(`managed skill resource escapes skillsRoot: ${configuredPath}`);
    }
    const expectedPath = join(canonicalRoot, relativePath);
    if (canonicalPath !== expectedPath) {
      throw new Error(`managed skill resource does not match configured path: ${configuredPath}`);
    }
    if (!(await lstat(canonicalPath)).isFile()) {
      throw new Error(`managed skill resource is not a regular file: ${configuredPath}`);
    }
    resources.push(canonicalPath);
  }

  return Object.freeze({
    root: canonicalRoot,
    skillPaths: Object.freeze(resources.slice(0, RETAINED_SKILL_NAMES.length)),
    resourcePaths: Object.freeze(resources),
  });
}
