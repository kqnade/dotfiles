import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandboxEnvironment } from './sandbox-env.mjs';
import { compareCapturedTrees } from './tree-changes.mjs';

const helper = fileURLToPath(new URL('./validate-tree.py', import.meta.url));

export async function validateCapturedTree({ records, stagingWorkspace, temporaryRoot, python, runProcess }) {
  if (typeof python !== 'string' || !isAbsolute(python)) {
    throw new TypeError('validation Python executable must be absolute');
  }
  const area = await createValidationTree({ records, stagingWorkspace, temporaryRoot });
  try {
    await runProcess({
      command: await realpath(python),
      args: ['-B', '-I', helper, area.workspace],
      cwd: stagingWorkspace,
      env: sandboxEnvironment(stagingWorkspace),
      inheritEnv: false,
      timeoutMs: 30_000,
      maxOutputBytes: 64 * 1024,
    });
  } catch (error) {
    try { await area.cleanup(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'tree validation and cleanup failed'); }
    throw error;
  }
  await area.cleanup();
  return area.records;
}

// The caller selects a temporaryRoot with the destination's name-lookup semantics.
export async function createValidationTree({ records, stagingWorkspace, temporaryRoot }) {
  const changes = compareCapturedTrees([], records);
  const stage = await realpath(stagingWorkspace);
  const parent = await realpath(temporaryRoot);
  const distance = relative(stage, parent);
  if (distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance))) {
    throw Object.assign(new Error('validation tree must be outside the command workspace'), { code: 'INVALID_VALIDATION_ROOT' });
  }
  let directory;
  try {
    directory = await mkdtemp(join(parent, 'pi-validation-'));
    await chmod(directory, 0o700);
    for (const { path, after } of changes) {
      const destination = join(directory, path);
      if (after.type === 'directory') await mkdir(destination, { mode: 0o700 });
      else if (after.type === 'file') await writeFile(destination, '', { mode: 0o600, flag: 'wx' });
      else await symlink(after.target, destination);
    }
    let cleanupPromise;
    return Object.freeze({
      workspace: directory,
      records: Object.freeze(changes.map(change => change.after)),
      cleanup: () => cleanupPromise ??= rm(directory, { recursive: true, force: true }),
    });
  } catch (error) {
    if (directory !== undefined) {
      try { await rm(directory, { recursive: true, force: true }); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'validation setup and cleanup failed'); }
    }
    throw error;
  }
}
