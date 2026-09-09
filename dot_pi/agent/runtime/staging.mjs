import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const within = (parent, child) => {
  const distance = relative(parent, child);
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance));
};

const hash = value => createHash('sha256').update(value).digest('hex');

const relativeFilePath = value => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('files must contain non-empty relative paths');
  }
  if (value.includes('\0')) throw new Error(`staging path contains NUL: ${value}`);
  const normalized = normalize(value);
  if (isAbsolute(value) || isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error(`staging path escapes cwd: ${value}`);
  }
  return normalized;
};

const cleanupDirectory = async directory => {
  await rm(directory, { recursive: true, force: true });
};

async function copyProjectFiles(cwd, workspace, copied, directory = '') {
  for (const name of await readdir(join(cwd, directory))) {
    if (name === '.git') continue;
    const path = join(directory, name);
    if (copied.has(path)) continue;
    const source = join(cwd, path);
    const destination = join(workspace, path);
    const entry = await lstat(source);
    if (entry.isSymbolicLink()) {
      const target = await realpath(source);
      if (!within(cwd, target) || relative(cwd, target).split(sep).includes('.git')) {
        throw new Error(`project context link escapes copied files: ${path}`);
      }
      const stagedTarget = join(workspace, relative(cwd, target));
      await symlink(relative(dirname(destination), stagedTarget) || '.', destination);
    } else if (entry.isDirectory()) {
      await mkdir(destination, { recursive: true, mode: 0o700 });
      await copyProjectFiles(cwd, workspace, copied, path);
    } else if (entry.isFile()) {
      await copyFile(source, destination, constants.COPYFILE_EXCL);
      await chmod(destination, (entry.mode & 0o111) === 0 ? 0o600 : 0o700);
    } else {
      throw new Error(`project context is not a regular file, directory, or internal link: ${path}`);
    }
  }
}

export async function copyRuntimeTree(source, destination) {
  const canonicalSource = await realpath(source);
  const canonicalDestination = await realpath(destination);
  if (within(canonicalSource, canonicalDestination) || within(canonicalDestination, canonicalSource)) {
    throw new Error('runtime source and destination must be separate directories');
  }
  await copyProjectFiles(canonicalSource, canonicalDestination, new Set());
}

export async function createStagingArea({ cwd, files, temporaryRoot = tmpdir(), includeProjectFiles = false } = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new TypeError('files must be a non-empty array');
  if (typeof cwd !== 'string' || cwd.length === 0) throw new TypeError('cwd must be a non-empty path');
  if (typeof temporaryRoot !== 'string' || temporaryRoot.length === 0) {
    throw new TypeError('temporaryRoot must be a non-empty path');
  }
  if (typeof includeProjectFiles !== 'boolean') throw new TypeError('includeProjectFiles must be a boolean');

  const canonicalCwd = await realpath(cwd);
  if (!(await stat(canonicalCwd)).isDirectory()) throw new Error('cwd must be a directory');
  const canonicalTemporaryRoot = await realpath(temporaryRoot);
  if (!(await stat(canonicalTemporaryRoot)).isDirectory()) throw new Error('temporaryRoot must be a directory');
  if (within(canonicalCwd, canonicalTemporaryRoot)) {
    throw new Error('cwd and temporaryRoot must be separate directories');
  }

  const seen = new Set();
  const sources = [];
  for (const file of files) {
    const path = relativeFilePath(file);
    if (seen.has(path)) throw new Error(`duplicate staging path: ${path}`);
    seen.add(path);

    const configuredPath = resolve(canonicalCwd, path);
    let sourceStat;
    try {
      sourceStat = await lstat(configuredPath);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        throw new Error(`staging source file is missing: ${path}`);
      }
      throw error;
    }
    if (sourceStat.isSymbolicLink()) throw new Error(`staging source file is a symlink: ${path}`);
    if (!sourceStat.isFile()) throw new Error(`staging source file is not a regular file: ${path}`);

    const originalPath = await realpath(configuredPath);
    if (originalPath !== configuredPath) throw new Error(`staging source path contains a symlink: ${path}`);
    const contents = await readFile(originalPath);
    sources.push({ path, originalPath, contents, hash: hash(contents) });
  }

  let directory;
  try {
    directory = await mkdtemp(join(canonicalTemporaryRoot, 'pi-staging-'));
    await chmod(directory, 0o700);
    const workspace = join(directory, 'work');
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    await chmod(workspace, 0o700);

    const manifest = [];
    for (const source of sources) {
      const stagedPath = join(workspace, source.path);
      await mkdir(dirname(stagedPath), { recursive: true, mode: 0o700 });
      await writeFile(stagedPath, source.contents, { mode: 0o600, flag: 'wx' });
      manifest.push(Object.freeze({
        path: source.path,
        originalPath: source.originalPath,
        stagedPath,
        hash: source.hash,
      }));
    }
    if (includeProjectFiles) await copyProjectFiles(canonicalCwd, workspace, seen);

    let cleanupPromise;
    const cleanup = () => {
      cleanupPromise ??= cleanupDirectory(directory);
      return cleanupPromise;
    };
    return Object.freeze({
      directory,
      workspace,
      files: Object.freeze(manifest),
      cleanup,
    });
  } catch (error) {
    if (directory !== undefined) {
      try {
        await cleanupDirectory(directory);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'staging setup and cleanup failed');
      }
    }
    throw error;
  }
}
