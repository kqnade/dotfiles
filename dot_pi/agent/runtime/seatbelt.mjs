import { realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, parse } from 'node:path';

const literal = path => {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f\x7f"\\]/u.test(path)) {
    throw new TypeError('Seatbelt paths must be absolute and contain no quotes, backslashes, or control characters');
  }
  if (parse(path).root === path) throw new Error('Seatbelt paths must not grant the filesystem root');
  return `"${path}"`;
};

export async function createSeatbeltProfile({ workspace, readPaths = [], readLiterals = [] } = {}) {
  literal(workspace);
  if (!Array.isArray(readPaths)) throw new TypeError('readPaths must be an array');
  if (!Array.isArray(readLiterals)) throw new TypeError('readLiterals must be an array');
  const canonical = await realpath(workspace);
  const quotedWorkspace = literal(canonical);
  const directory = await stat(canonical);
  if (!directory.isDirectory() || (directory.mode & 0o777) !== 0o700) {
    throw new Error('Seatbelt workspace must be a private directory with mode 0700');
  }

  const reads = new Set([
    '(literal "/")',
    '(literal "/private/var/select/sh")',
    '(subpath "/bin")',
    '(subpath "/sbin")',
    '(subpath "/usr/bin")',
    '(subpath "/usr/sbin")',
    '(subpath "/usr/lib")',
    '(subpath "/System/Library")',
    '(literal "/dev/null")',
    '(literal "/dev/random")',
    '(literal "/dev/urandom")',
    `(subpath ${quotedWorkspace})`,
  ]);
  const metadata = new Set(['(literal "/var")', '(literal "/System/Cryptexes/OS")']);
  const addAncestors = path => {
    for (let parent = dirname(path); parent !== dirname(parent); parent = dirname(parent)) {
      metadata.add(`(literal ${literal(parent)})`);
    }
  };
  addAncestors(canonical);
  for (const path of readLiterals) {
    const quoted = literal(path);
    if (normalize(path) !== path) throw new Error('literal read paths must be normalized');
    reads.add(`(literal ${quoted})`);
    addAncestors(path);
  }
  for (const path of readPaths) {
    literal(path);
    const resolved = await realpath(path);
    const quoted = literal(resolved);
    const entry = await stat(resolved);
    if (!entry.isDirectory() && !entry.isFile()) throw new Error('Seatbelt read paths must be files or directories');
    reads.add(`(${entry.isDirectory() ? 'subpath' : 'literal'} ${quoted})`);
    addAncestors(resolved);
  }

  return [
    '(version 1)',
    '(deny default)',
    '(allow process-exec)',
    '(allow process-fork)',
    '(allow process-info* (target same-sandbox))',
    '(allow signal (target same-sandbox))',
    '(allow sysctl-read)',
    `(allow file-read-metadata ${[...metadata].join(' ')})`,
    `(allow file-read* ${[...reads].join(' ')})`,
    `(allow file-write* (subpath ${quotedWorkspace}))`,
    '(allow file-write-data (literal "/dev/null"))',
    '',
  ].join('\n');
}
