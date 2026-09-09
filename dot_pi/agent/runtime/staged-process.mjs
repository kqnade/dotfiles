import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { Ownership } from './ownership.mjs';
import { sandboxEnvironment } from './sandbox-env.mjs';
import { createSeatbeltProfile } from './seatbelt.mjs';
import { createStagingArea } from './staging.mjs';

const within = (parent, child) => {
  const distance = relative(parent, child);
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance));
};

async function seatbeltCommand({ workspace, command, args, readPaths }) {
  if (process.platform !== 'darwin') {
    throw Object.assign(new Error('staged execution requires the macOS Seatbelt backend'), { code: 'UNSUPPORTED_SANDBOX' });
  }
  if (typeof command !== 'string' || !isAbsolute(command)) throw new TypeError('sandbox command must be absolute');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new TypeError('sandbox arguments must be strings without NUL');
  }
  const executable = await realpath(command);
  const profile = await createSeatbeltProfile({ workspace, readPaths: [executable, ...readPaths] });
  return {
    command: '/usr/bin/sandbox-exec',
    args: ['-p', profile, executable, ...args],
    cwd: workspace,
    env: sandboxEnvironment(workspace),
  };
}

export async function runStagedProcess({
  ownership, lease, cwd, files, readFiles = [], temporaryRoot, prepare,
  command, args = [], readPaths = [], stdin = '', signal, timeoutMs, maxOutputBytes,
}, sandbox = seatbeltCommand) {
  return ownership.run(lease, async () => {
    if (!Array.isArray(files) || files.length === 0) throw new TypeError('files must be a non-empty array');
    if (!Array.isArray(readFiles)) throw new TypeError('readFiles must be an array');
    if (prepare !== undefined && typeof prepare !== 'function') throw new TypeError('prepare must be a function');
    const ownedPaths = new Set();
    for (const file of files) {
      const canonical = await realpath(resolve(cwd, file));
      if (!lease.paths.some(path => within(path, canonical))) {
        throw Object.assign(new Error(`staging source is outside ownership scope: ${file}`), { code: 'OUT_OF_SCOPE' });
      }
      ownedPaths.add(canonical);
    }
    const area = await createStagingArea({ cwd, files: [...files, ...readFiles], temporaryRoot });
    let stageOwnership;
    let stageLease;
    let failure;
    try {
      stageOwnership = new Ownership({ cwd: area.workspace });
      stageLease = stageOwnership.claim(lease.owner, ['.']);
      const prepared = prepare === undefined ? {} : await prepare(Object.freeze({ workspace: area.workspace, files: area.files }));
      const invocation = await sandbox({
        workspace: area.workspace,
        command: prepared.command ?? command,
        args: prepared.args ?? args,
        readPaths: prepared.readPaths ?? readPaths,
      });
      const output = await stageOwnership.runProcess(stageLease, {
        ...invocation, stdin: prepared.stdin ?? stdin, signal, timeoutMs, maxOutputBytes,
      });
      return {
        ...output,
        files: Object.freeze(area.files.filter(file => ownedPaths.has(file.originalPath))
          .map(({ path, originalPath, hash }) => Object.freeze({ path, originalPath, hash }))),
      };
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const errors = [];
      try { if (stageLease) await stageOwnership.drain(stageLease); }
      catch (error) { errors.push(error); }
      try { await area.cleanup(); }
      catch (error) { errors.push(error); }
      if (errors.length > 0) {
        const error = new AggregateError(failure ? [failure, ...errors] : errors, 'staged process cleanup failed');
        ownership.quarantine(lease, error);
        throw error;
      }
    }
  });
}
