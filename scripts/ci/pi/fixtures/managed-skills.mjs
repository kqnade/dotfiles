import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const RETAINED_SKILL_NAMES = Object.freeze([
  'test-driven-development',
  'evidence-review',
  'sanitize-artifacts',
  'using-workflow-skills',
  'context-handoff',
  'todo-management',
]);

export const RETAINED_SKILL_RESOURCES = Object.freeze([
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

export async function createManagedSkills(root) {
  for (const relativePath of RETAINED_SKILL_RESOURCES) {
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const text = relativePath.endsWith('/SKILL.md')
      ? `---\nname: ${relativePath.split('/')[0]}\ndescription: fixture skill\n---\n`
      : `fixture resource: ${relativePath}\n`;
    await writeFile(target, text);
  }
  return root;
}
