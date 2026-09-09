import { isAbsolute, normalize } from 'node:path';

const sandboxPath = '/usr/bin:/bin:/usr/sbin:/sbin';

export function sandboxEnvironment(workspace) {
  if (typeof workspace !== 'string' || workspace.length === 0) {
    throw new TypeError('workspace must be a non-empty path');
  }
  if (workspace.includes('\0')) throw new Error('workspace must not contain NUL');
  if (!isAbsolute(workspace)) throw new Error('workspace must be absolute');
  if (normalize(workspace) !== workspace) throw new Error('workspace must be normalized');

  return Object.freeze({
    HOME: workspace,
    TMPDIR: workspace,
    PATH: sandboxPath,
    LANG: 'C',
    LC_ALL: 'C',
  });
}
