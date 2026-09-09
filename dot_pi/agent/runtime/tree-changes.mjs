import { isDeepStrictEqual } from 'node:util';

export function compareCapturedTrees(baseline, captured) {
  const before = new Map(baseline.map(record => [record.path, record]));
  const after = new Map(captured.map(record => [record.path, record]));
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
