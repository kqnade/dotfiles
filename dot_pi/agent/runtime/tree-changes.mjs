import { isDeepStrictEqual } from 'node:util';

function indexTree(records) {
  const tree = new Map();
  for (const record of records) {
    if (tree.has(record.path)) {
      throw Object.assign(new Error('captured tree contains a duplicate path'), { code: 'INVALID_CAPTURED_TREE' });
    }
    tree.set(record.path, record);
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
