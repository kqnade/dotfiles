import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { formatFile } from '../../../dot_pi/agent/runtime/format.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

// Portable tests substitute only the OS confinement boundary.
const runner = process.platform === 'darwin' ? undefined : invocation => runStagedProcess(invocation,
  async ({ workspace, command, args }) => ({ command, args, cwd: workspace, env: sandboxEnvironment(workspace) }));

test('rustup shim selects the caller cwd toolchain inside the sandbox', {
  skip: process.env.PI_RUSTUP_BIN && process.env.PI_RUSTFMT_BIN ? false : 'requires PI_RUSTUP_BIN and PI_RUSTFMT_BIN',
  timeout: 60_000,
}, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-format-rustup-')));
  const environment = Object.fromEntries(['PATH', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN'].map(name => [name, process.env[name]]));
  try {
    const cwd = join(root, 'project');
    const rustupHome = join(root, 'rustup');
    await mkdir(cwd);
    await mkdir(join(cwd, 'src'));
    await mkdir(join(root, 'bin'));
    await mkdir(join(rustupHome, 'toolchains'), { recursive: true });
    await symlink(await realpath(process.env.PI_RUSTUP_BIN), join(root, 'bin', 'rustfmt'));
    await symlink(dirname(dirname(await realpath(process.env.PI_RUSTFMT_BIN))), join(rustupHome, 'toolchains', 'fixture'));
    const settings = `version = "12"\ndefault_toolchain = "fixture"\n[overrides]\n${JSON.stringify(join(cwd, 'src'))} = "missing"\n`;
    await writeFile(join(rustupHome, 'settings.toml'), settings);
    process.env.PATH = join(root, 'bin') + delimiter + environment.PATH;
    process.env.RUSTUP_HOME = rustupHome;
    delete process.env.RUSTUP_TOOLCHAIN;
    await writeFile(join(cwd, 'src', 'main.rs'), 'fn main(){println!("hello");}\n');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('formatter', ['src/main.rs']);
    await formatFile({ ownership, lease, cwd, path: 'src/main.rs' }, runner);
    assert.equal(await readFile(join(cwd, 'src', 'main.rs'), 'utf8'), 'fn main() {\n    println!("hello");\n}\n');
    assert.equal(await readFile(join(rustupHome, 'settings.toml'), 'utf8'), settings);
    await writeFile(join(rustupHome, 'settings.toml'), 'version = "12"\ndefault_toolchain = "missing"\n');
    for (const [name, contents] of [
      ['rust-toolchain', 'fixture\n'],
      ['rust-toolchain.toml', '[toolchain]\nchannel = "fixture"\n'],
    ]) {
      await t.test(`selects ${name} over the default`, async () => {
        await writeFile(join(cwd, name), contents);
        assert.equal((await formatFile({ ownership, lease, cwd, path: 'src/main.rs' }, runner)).status, 'unchanged');
        assert.equal(await readFile(join(cwd, name), 'utf8'), contents);
        await rm(join(cwd, name));
      });
    }
    await writeFile(join(cwd, 'rust-toolchain.toml'), '[toolchain]\nchannel = "missing"\n');
    await t.test('environment overrides the toolchain file', async () => {
      process.env.RUSTUP_TOOLCHAIN = 'fixture';
      try {
        assert.equal((await formatFile({ ownership, lease, cwd, path: 'src/main.rs' }, runner)).status, 'unchanged');
      } finally { delete process.env.RUSTUP_TOOLCHAIN; }
    });
    await t.test('caller directory override takes precedence over its toolchain file', async () => {
      await writeFile(join(rustupHome, 'settings.toml'), `version = "12"\ndefault_toolchain = "missing"\n[overrides]\n${JSON.stringify(cwd)} = "fixture"\n`);
      assert.equal((await formatFile({ ownership, lease, cwd, path: 'src/main.rs' }, runner)).status, 'unchanged');
    });
    await t.test('missing selected toolchain preserves source and settings', async () => {
      const unavailable = 'version = "12"\ndefault_toolchain = "missing"\n';
      await writeFile(join(rustupHome, 'settings.toml'), unavailable);
      await assert.rejects(formatFile({ ownership, lease, cwd, path: 'src/main.rs' }, runner), { code: 'PROCESS_FAILED' });
      assert.equal(await readFile(join(cwd, 'src', 'main.rs'), 'utf8'), 'fn main() {\n    println!("hello");\n}\n');
      assert.equal(await readFile(join(rustupHome, 'settings.toml'), 'utf8'), unavailable);
      await ownership.run(lease, async () => {});
    });
    await ownership.drain(lease);
  } finally {
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('installed rustfmt uses the package edition from copied Cargo.toml', {
  skip: process.env.PI_RUSTFMT_BIN ? false : 'requires PI_RUSTFMT_BIN',
  timeout: 60_000,
}, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-format-cargo-')));
  const originalPath = process.env.PATH;
  try {
    const cwd = join(root, 'project');
    await mkdir(join(cwd, 'src'), { recursive: true });
    await mkdir(join(root, 'bin'));
    await symlink(await realpath(process.env.PI_RUSTFMT_BIN), join(root, 'bin', 'rustfmt'));
    process.env.PATH = join(root, 'bin') + delimiter + originalPath;
    const manifest = '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n';
    await writeFile(join(cwd, 'Cargo.toml'), manifest);
    const target = join(cwd, 'src', 'lib.rs');
    await writeFile(target, 'pub async fn run(){println!("hello");}\n');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('formatter', ['src/lib.rs']);
    const result = await formatFile({ ownership, lease, cwd, path: 'src/lib.rs' }, runner);
    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(target, 'utf8'), 'pub async fn run() {\n    println!("hello");\n}\n');
    assert.equal(await readFile(join(cwd, 'Cargo.toml'), 'utf8'), manifest);
    const config = 'edition = "2015"\ntab_spaces = 2\n';
    await writeFile(join(cwd, 'rustfmt.toml'), config);
    await formatFile({ ownership, lease, cwd, path: 'src/lib.rs' }, runner);
    assert.equal(await readFile(target, 'utf8'), 'pub async fn run() {\n  println!("hello");\n}\n');
    assert.equal(await readFile(join(cwd, 'rustfmt.toml'), 'utf8'), config);
    const changedManifest = manifest.replace('2024', '2015');
    await writeFile(target, 'pub async fn run(){println!("hello");}\n');
    await formatFile({ ownership, lease, cwd, path: 'src/lib.rs' }, invocation => (runner ?? runStagedProcess)({
      ...invocation,
      prepare: async area => {
        await writeFile(join(cwd, 'Cargo.toml'), changedManifest);
        return invocation.prepare(area);
      },
    }));
    assert.equal(await readFile(target, 'utf8'), 'pub async fn run() {\n  println!("hello");\n}\n');
    assert.equal(await readFile(join(cwd, 'Cargo.toml'), 'utf8'), changedManifest);
    await writeFile(join(cwd, 'Cargo.toml'), '[package\n');
    await assert.rejects(formatFile({ ownership, lease, cwd, path: 'src/lib.rs' }, runner), /Invalid TOML document/u);
    assert.equal(await readFile(target, 'utf8'), 'pub async fn run() {\n  println!("hello");\n}\n');
    await ownership.run(lease, async () => {});
    await ownership.drain(lease);
  } finally {
    process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});

test('installed native rustfmt runs with its toolchain libraries', {
  skip: process.env.PI_RUSTFMT_BIN ? false : 'requires PI_RUSTFMT_BIN',
  timeout: 60_000,
}, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-format-rust-')));
  const originalPath = process.env.PATH;
  try {
    const cwd = join(root, 'project');
    await mkdir(cwd);
    await mkdir(join(root, 'bin'));
    await symlink(await realpath(process.env.PI_RUSTFMT_BIN), join(root, 'bin', 'rustfmt'));
    process.env.PATH = join(root, 'bin') + delimiter + originalPath;
    const target = join(cwd, 'main.rs');
    await writeFile(target, 'fn main(){println!("hello");}\n');
    const ownership = new Ownership({ cwd });
    const lease = ownership.claim('formatter', ['main.rs']);
    const result = await formatFile({ ownership, lease, cwd, path: 'main.rs' }, runner);
    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(target, 'utf8'), 'fn main() {\n    println!("hello");\n}\n');
    await ownership.drain(lease);

    await mkdir(join(cwd, 'src'));
    await writeFile(join(cwd, 'rustfmt.toml'), 'tab_spaces = 4\nedition = "2015"\n');
    await writeFile(join(cwd, 'src', '.rustfmt.toml'), 'tab_spaces = 2\nedition = "2024"\n');
    const nested = join(cwd, 'src', 'lib.rs');
    await writeFile(nested, 'async fn run(){println!("hello");}\n');
    const nestedOwnership = new Ownership({ cwd });
    const nestedLease = nestedOwnership.claim('formatter', ['src/lib.rs']);
    await formatFile({ ownership: nestedOwnership, lease: nestedLease, cwd, path: 'src/lib.rs' }, runner);
    assert.equal(await readFile(nested, 'utf8'), 'async fn run() {\n  println!("hello");\n}\n');
    assert.equal((await formatFile({ ownership: nestedOwnership, lease: nestedLease, cwd, path: 'src/lib.rs' }, runner)).status, 'unchanged');
    await writeFile(nested, 'fn invalid(\n');
    await assert.rejects(formatFile({ ownership: nestedOwnership, lease: nestedLease, cwd, path: 'src/lib.rs' }, runner), { code: 'PROCESS_FAILED' });
    assert.equal(await readFile(nested, 'utf8'), 'fn invalid(\n');
    assert.equal(await readFile(join(cwd, 'src', '.rustfmt.toml'), 'utf8'), 'tab_spaces = 2\nedition = "2024"\n');
    await nestedOwnership.drain(nestedLease);
  } finally {
    process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});

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
