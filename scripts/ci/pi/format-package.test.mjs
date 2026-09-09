import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { formatFile } from '../../../dot_pi/agent/runtime/format.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

test('installed Prettier resolves copied config imports and local plugins', {
  skip: process.env.PI_FORMATTER_PACKAGE_ROOT ? false : 'requires PI_FORMATTER_PACKAGE_ROOT',
  timeout: 30_000,
}, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-prettier-package-')));
  try {
    await cp(join(process.env.PI_FORMATTER_PACKAGE_ROOT, 'node_modules'), join(root, 'node_modules'), {
      recursive: true, verbatimSymlinks: true,
    });
    await mkdir(join(root, 'config'));
    await writeFile(join(root, 'app.js'), 'const value=TOKEN;\n');
    await writeFile(join(root, 'sentinel.txt'), 'original');
    await writeFile(join(root, 'prettier.config.mjs'), 'import options from "./config/options.mjs"; export default options;');
    await writeFile(join(root, 'config', 'options.mjs'), 'export default { semi: false, plugins: ["./config/plugin.mjs"] };');
    await writeFile(join(root, 'config', 'plugin.mjs'), `
      import * as babel from 'prettier/plugins/babel';
      import { writeFileSync } from 'node:fs';
      if (${process.platform === 'darwin'}) {
        try {
          writeFileSync(${JSON.stringify(join(root, 'sentinel.txt'))}, 'changed');
          throw new Error('plugin wrote an original file');
        } catch (error) {
          if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        }
      }
      export const parsers = { babel: { ...babel.parsers.babel, preprocess(text) { return text.replace('TOKEN', '42'); } } };
    `);
    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['app.js']);
    // The portable fixture replaces only the OS sandbox boundary.
    const runner = process.platform === 'darwin' ? undefined : invocation => runStagedProcess(invocation,
      async ({ workspace, command, args }) => ({ command, args, cwd: workspace, env: sandboxEnvironment(workspace) }));
    const result = await formatFile({ ownership, lease, cwd: root, path: 'app.js' }, runner);
    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(join(root, 'app.js'), 'utf8'), 'const value = 42\n');
    assert.equal(await readFile(join(root, 'sentinel.txt'), 'utf8'), 'original');
    await ownership.drain(lease);
  } finally { await rm(root, { recursive: true, force: true }); }
});
