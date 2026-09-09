import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCapturedTrees } from '../../../dot_pi/agent/runtime/tree-changes.mjs';

test('tree comparison rejects malformed snapshot records with one explicit validation error', () => {
  const file = { path: 'file', type: 'file', mode: 0o600, content: 'YQ==' };
  const invalid = [
    null, {}, 'file', [null], [[]], [{}],
    [{ ...file, type: 'socket' }],
    [{ ...file, type: ['file'] }],
    [{ ...file, mode: -1 }], [{ ...file, mode: 0o10000 }], [{ ...file, mode: 1.5 }],
    [{ ...file, mode: '600' }],
    [{ ...file, content: null }], [{ ...file, content: 'YQ' }], [{ ...file, content: 'YR==' }],
    [{ ...file, extra: { mutable: true } }],
    [{ path: 'dir', type: 'directory' }],
    [{ path: 'dir', type: 'directory', mode: 0o700, content: '' }],
    ...['', null, 'target\0tail', '\ud800'].map(target => [{ path: 'link', type: 'symlink', target }]),
    [{ path: 'link', type: 'symlink', target: 'file', mode: 0o777 }],
  ];
  for (const records of invalid) {
    assert.throws(() => compareCapturedTrees(records, []), { code: 'INVALID_CAPTURED_TREE' });
    assert.throws(() => compareCapturedTrees([], records), { code: 'INVALID_CAPTURED_TREE' });
  }
});

test('tree comparison requires canonical relative UTF-8 paths in both snapshots', () => {
  for (const path of ['', '/outside', '../file', 'dir/../file', './file', 'dir//file', 'dir/', 'file\0tail', '\ud800', null, 7]) {
    const record = { path, type: 'file', mode: 0o600, content: '' };
    assert.throws(() => compareCapturedTrees([record], []), { code: 'INVALID_CAPTURED_TREE' });
    assert.throws(() => compareCapturedTrees([], [record]), { code: 'INVALID_CAPTURED_TREE' });
  }
});

test('tree comparison rejects duplicate paths in either snapshot instead of hiding changes', () => {
  const original = { path: 'file', type: 'file', mode: 0o600, content: 'YQ==' };
  const changed = { ...original, content: 'Yg==' };
  assert.throws(() => compareCapturedTrees([original, changed], [changed]), { code: 'INVALID_CAPTURED_TREE' });
  assert.throws(() => compareCapturedTrees([original], [changed, original]), { code: 'INVALID_CAPTURED_TREE' });
});

test('tree comparison returns immutable additions, changes, and removals while omitting unchanged preparation', () => {
  const changed = { path: 'changed', type: 'file', mode: 0o600, content: 'YQ==' };
  const deleted = { path: 'deleted', type: 'file', mode: 0o600, content: 'Yg==' };
  const prepared = { path: 'runtime', type: 'file', mode: 0o700, content: 'Yw==' };
  const updated = { ...changed, content: 'ZA==' };
  const added = { path: 'added', type: 'directory', mode: 0o700 };
  const changes = compareCapturedTrees([prepared, deleted, changed], [updated, added, { ...prepared }]);
  assert.deepEqual(changes, [
    { path: 'added', before: null, after: added },
    { path: 'changed', before: changed, after: updated },
    { path: 'deleted', before: deleted, after: null },
  ]);
  changed.content = '';
  added.mode = 0;
  assert.equal(changes[1].before.content, 'YQ==');
  assert.equal(changes[0].after.mode, 0o700);
  assert.throws(() => changes.pop(), TypeError);
  assert.throws(() => { changes[0].after.mode = 0; }, TypeError);
  assert.throws(() => { changes[0].after = null; }, TypeError);
});
