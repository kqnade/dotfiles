import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { formatFile } from '../../../dot_pi/agent/runtime/format.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

// Portable tests substitute only the OS confinement boundary.
const runner = process.platform === 'darwin' ? undefined : invocation => runStagedProcess(invocation,
  async ({ workspace, command, args }) => ({ command, args, cwd: workspace, env: sandboxEnvironment(workspace) }));

test('installed Ruff uses ancestor ruff.toml for a nested Python file', {
  skip: process.env.PI_RUFF_BIN ? false : 'requires PI_RUFF_BIN',
  timeout: 30_000,
}, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-format-ruff-')));
  const originalPath = process.env.PATH;
  try {
    const cwd = join(root, 'project');
    await mkdir(join(cwd, 'src'), { recursive: true });
    await mkdir(join(root, 'bin'));
    await symlink(await realpath(process.env.PI_RUFF_BIN), join(root, 'bin', 'ruff'));
    process.env.PATH = join(root, 'bin') + delimiter + originalPath;
    await writeFile(join(cwd, 'ruff.toml'), '[format]\nquote-style = "single"\n');
    const target = join(cwd, 'src', 'app.py');
    await writeFile(target, 'message="hello"\n');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('formatter', ['src/app.py']);
    const result = await formatFile({ ownership, lease, cwd, path: 'src/app.py' }, runner);
    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(target, 'utf8'), "message = 'hello'\n");
    assert.equal((await formatFile({ ownership, lease, cwd, path: 'src/app.py' }, runner)).status, 'unchanged');

    await writeFile(join(cwd, 'src', '.ruff.toml'), 'extend = "../ruff.toml"\n[format]\nquote-style = "double"\n');
    await formatFile({ ownership, lease, cwd, path: 'src/app.py' }, runner);
    assert.equal(await readFile(target, 'utf8'), 'message = "hello"\n');
    assert.equal(await readFile(join(cwd, 'ruff.toml'), 'utf8'), '[format]\nquote-style = "single"\n');

    await writeFile(target, 'def invalid(\n');
    await assert.rejects(formatFile({ ownership, lease, cwd, path: 'src/app.py' }, runner), { code: 'PROCESS_FAILED' });
    assert.equal(await readFile(target, 'utf8'), 'def invalid(\n');
    await ownership.drain(lease);
  } finally {
    process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});
