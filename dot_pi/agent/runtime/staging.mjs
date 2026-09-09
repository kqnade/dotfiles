import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
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

export async function createStagingArea({ cwd, files, temporaryRoot = tmpdir() } = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new TypeError('files must be a non-empty array');
  if (typeof cwd !== 'string' || cwd.length === 0) throw new TypeError('cwd must be a non-empty path');
  if (typeof temporaryRoot !== 'string' || temporaryRoot.length === 0) {
    throw new TypeError('temporaryRoot must be a non-empty path');
  }

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
