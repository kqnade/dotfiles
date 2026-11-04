import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { requireDsh } from './integration/dsh-resolve.mjs';

test('resolves bundled dependencies beside the real CLI in an isolated pnpm store', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-resolution-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profile = join(root, 'profile');
  const store = join(profile, 'node_modules/.pnpm/dsh/node_modules/@deepseek-ai');
  mkdirSync(join(store, 'dsh'), { recursive: true });
  mkdirSync(join(profile, 'node_modules/@deepseek-ai'), { recursive: true });
  writeFileSync(join(profile, 'package.json'), '{}');
  writeFileSync(join(store, 'dsh/package.json'), '{}');
  symlinkSync(join(store, 'dsh'), join(profile, 'node_modules/@deepseek-ai/dsh'));
  for (const name of ['dsh-experimental-auto-review', 'dsh-base', 'dsh-web-app']) {
    mkdirSync(join(store, name));
    writeFileSync(join(store, name, 'index.js'), 'module.exports = {};');
    assert.equal(requireDsh(profile).resolve(`@deepseek-ai/${name}`), join(store, name, 'index.js'));
  }
});

test('missing installed CLI fails instead of resolving unrelated host packages', () => {
  assert.throws(() => requireDsh('/nonexistent-dsh-profile'), /ENOENT/);
});
