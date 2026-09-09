import { isDeepStrictEqual } from 'node:util';

const invalidTree = message => Object.assign(new Error(message), { code: 'INVALID_CAPTURED_TREE' });
const validString = value => typeof value === 'string' && value.length > 0 && value.isWellFormed() && !value.includes('\0');

function validateRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw invalidTree('captured tree records must be objects');
  }
  const fields = {
    file: ['content', 'mode', 'path', 'type'],
    directory: ['mode', 'path', 'type'],
    symlink: ['path', 'target', 'type'],
  };
  if (typeof record.type !== 'string' || !Object.hasOwn(fields, record.type)
    || !isDeepStrictEqual(Object.keys(record).sort(), fields[record.type])) {
    throw invalidTree('captured tree record has invalid fields');
  }
  if (record.type === 'symlink') {
    if (!validString(record.target)) throw invalidTree('captured link target must be a nonempty UTF-8 string without NUL');
  } else {
    if (!Number.isInteger(record.mode) || record.mode < 0 || record.mode > 0o7777) {
      throw invalidTree('captured mode must contain only permission bits');
    }
    if (record.type === 'file' && (typeof record.content !== 'string'
      || Buffer.from(record.content, 'base64').toString('base64') !== record.content)) {
      throw invalidTree('captured file content must be canonical base64');
    }
  }
}

function indexTree(records) {
  if (!Array.isArray(records)) throw invalidTree('captured tree must be an array');
  const tree = new Map();
  for (const record of records) {
    validateRecord(record);
    const path = record.path;
    if (!validString(path)
      || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
      throw invalidTree('captured tree path must be canonical and relative');
    }
    if (tree.has(record.path)) {
      throw invalidTree('captured tree contains a duplicate path');
    }
    tree.set(record.path, record);
  }
  for (const path of tree.keys()) {
    const slash = path.lastIndexOf('/');
    if (slash !== -1 && tree.get(path.slice(0, slash))?.type !== 'directory') {
      throw invalidTree('captured tree entry must have a directory parent');
    }
  }
  return tree;
}

export function compareCapturedTrees(baseline, captured) {
  const before = indexTree(baseline);
  const after = indexTree(captured);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = [];
  for (const path of paths) {
    const previous = before.get(path) ?? null;
    const current = after.get(path) ?? null;
    if (isDeepStrictEqual(previous, current)) continue;
    changes.push(Object.freeze({
      path,
      before: previous === null ? null : Object.freeze({ ...previous }),
      after: current === null ? null : Object.freeze({ ...current }),
    }));
  }
  return Object.freeze(changes);
}
