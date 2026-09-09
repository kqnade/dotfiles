import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { resolveRustfmt } from '../../../dot_pi/agent/runtime/rustup.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

const runner = invocation => runStagedProcess(invocation, process.platform === 'darwin' ? undefined :
  async ({ workspace, command, args }) => ({ command, args, cwd: workspace, env: sandboxEnvironment(workspace) }));

test('cancelling an active rustup resolver cleans its stage and preserves the lease', { timeout: 10_000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-rustup-cancel-')));
  const originalHome = process.env.RUSTUP_HOME;
  const controller = new AbortController();
  let execution;
  let workspace;
  try {
    const cwd = join(root, 'project');
    const home = join(root, 'rustup-home');
    await mkdir(cwd);
    await mkdir(join(home, 'toolchains'), { recursive: true });
    process.env.RUSTUP_HOME = home;
    const path = join(cwd, 'main.rs');
    await writeFile(path, 'fn main() {}\n');
    const command = join(root, 'rustup');
    await writeFile(command, '#!/bin/sh\nprintf ready > "$HOME/ready"\nexec /bin/sleep 30\n', { mode: 0o700 });
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('formatter', ['main.rs']);
    execution = resolveRustfmt({ ownership, lease, cwd, path, command, signal: controller.signal }, invocation => runner({
      ...invocation, prepare: async area => { workspace = area.workspace; return {}; },
    }));
    const cancelled = assert.rejects(execution, error => {
      assert.equal(error.code, 'ABORT_ERR', error.errors?.map(cause => `${cause.code}: ${cause.message}`).join('; '));
      return true;
    });
    const deadline = Date.now() + 3000;
    while (true) {
      try {
        if (workspace) {
          await access(join(workspace, 'ready'));
          break;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      assert.ok(Date.now() < deadline, 'resolver did not become ready');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    controller.abort();
    await cancelled;
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    assert.equal(await readFile(path, 'utf8'), 'fn main() {}\n');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    controller.abort();
    await execution?.catch(() => {});
    if (originalHome === undefined) delete process.env.RUSTUP_HOME;
    else process.env.RUSTUP_HOME = originalHome;
    await rm(root, { recursive: true, force: true });
  }
});

test('rustup resolver accepts registered paths and rejects unregistered or malformed output', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-rustup-output-')));
  const originalHome = process.env.RUSTUP_HOME;
  try {
    const cwd = join(root, 'project');
    const home = join(root, 'rustup-home');
    await mkdir(cwd);
    const bin = join(home, 'toolchains', 'fixture', 'bin');
    await mkdir(bin, { recursive: true });
    const candidate = join(bin, 'rustfmt');
    await writeFile(candidate, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    process.env.RUSTUP_HOME = home;
    const path = join(cwd, 'main.rs');
    await writeFile(path, 'fn main() {}\n');
    const command = join(root, 'rustup');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('formatter', ['main.rs']);
    for (const response of [join(root, 'missing-rustfmt'), command, 'relative/rustfmt', `${candidate}\n${candidate}`, `${candidate}\n`, '', candidate]) {
      const quoted = `'${response.replaceAll("'", "'\\''")}'`;
      await writeFile(command, `#!/bin/sh\nprintf '%s\\n' ${quoted}\n`, { mode: 0o700 });
      const resolving = resolveRustfmt({ ownership, lease, cwd, path, command }, runner);
      if (response === candidate) assert.equal(await resolving, candidate);
      else await assert.rejects(resolving, { code: 'FORMATTER_MISSING' });
    }
    assert.equal(await readFile(path, 'utf8'), 'fn main() {}\n');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    if (originalHome === undefined) delete process.env.RUSTUP_HOME;
    else process.env.RUSTUP_HOME = originalHome;
    await rm(root, { recursive: true, force: true });
  }
});
