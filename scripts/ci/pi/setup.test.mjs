import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { prepare } from '../../../scripts/pi/setup.mjs';

const exists = async (path) => access(path).then(() => true, () => false);

test('the global LSP config uses mise-owned system commands without auto-installing', async () => {
  const config = JSON.parse(await readFile(new URL('../../../dot_pi/agent/lsp.json', import.meta.url), 'utf8'));
  const expected = {
    vtsls: ['vtsls', '--stdio'],
    pyright: ['pyright-langserver', '--stdio'],
    gopls: ['gopls'],
    'rust-analyzer': ['rust-analyzer'],
  };

  assert.equal(config.installMode, 'off');
  assert.equal(config.warmup, true);
  assert.deepEqual(Object.keys(config.servers).sort(), Object.keys(expected).sort());
  for (const [server, command] of Object.entries(expected)) {
    assert.deepEqual(config.servers[server].command, command);
    assert.deepEqual(config.servers[server].install, { type: 'system', command });
  }
});

test('the package manifests pin the Pi runtime, LSP adapter, and TOML parser', async () => {
  const packageRoot = new URL('../../../dot_pi/agent/packages/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('package-lock.json', packageRoot), 'utf8'));

  assert.deepEqual(manifest.dependencies, {
    '@earendil-works/pi-coding-agent': '0.85.1',
    'pi-lsp-adapter': '0.1.3',
    'smol-toml': '1.8.0',
  });
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  assert.equal(lock.packages['node_modules/@earendil-works/pi-coding-agent'].version, '0.85.1');
  assert.equal(lock.packages['node_modules/pi-lsp-adapter'].version, '0.1.3');
  assert.equal(lock.packages['node_modules/smol-toml'].version, '1.8.0');
});

test('prepares the pinned package in an external npm install directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-setup-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'install');
    await mkdir(source);
    await writeFile(join(source, 'package.json'), '{"name":"pi-agent-packages"}\n');
    await writeFile(join(source, 'package-lock.json'), '{"name":"pi-agent-packages","lockfileVersion":3}\n');

    const calls = [];
    const run = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      await mkdir(join(options.cwd, 'node_modules'));
      await writeFile(join(options.cwd, 'node_modules', 'installed'), 'ok\n');
    };

    const result = await prepare({
      packageSource: source,
      packageTarget: target,
      npmCommand: 'npm',
      run,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'npm');
    assert.deepEqual(calls[0].args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.notEqual(calls[0].cwd, source);
    assert.equal(result.target, target);
    assert.equal(await readFile(join(target, 'node_modules', 'installed'), 'utf8'), 'ok\n');
    assert.equal(await exists(join(source, 'node_modules')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rerunning the preparation replaces the previous external install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-setup-repeat-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'install');
    await mkdir(source);
    await writeFile(join(source, 'package.json'), '{"name":"pi-agent-packages"}\n');
    await writeFile(join(source, 'package-lock.json'), '{"name":"pi-agent-packages","lockfileVersion":3}\n');

    let runCount = 0;
    const run = async (_command, _args, options) => {
      runCount += 1;
      await mkdir(join(options.cwd, 'node_modules'));
      await writeFile(join(options.cwd, 'node_modules', 'run'), `${runCount}\n`);
    };

    await prepare({ packageSource: source, packageTarget: target, run });
    await prepare({ packageSource: source, packageTarget: target, run });

    assert.equal(await readFile(join(target, 'node_modules', 'run'), 'utf8'), '2\n');
    assert.equal(await exists(join(source, 'node_modules')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed npm install preserves the previous external install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-setup-failure-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'install');
    await mkdir(source);
    await writeFile(join(source, 'package.json'), '{"name":"pi-agent-packages"}\n');
    await writeFile(join(source, 'package-lock.json'), '{"name":"pi-agent-packages","lockfileVersion":3}\n');
    await mkdir(join(target, 'node_modules'), { recursive: true });
    await writeFile(join(target, 'node_modules', 'sentinel'), 'previous\n');

    const run = async () => {
      throw new Error('npm failed');
    };

    await assert.rejects(
      prepare({ packageSource: source, packageTarget: target, run }),
      /npm failed/,
    );
    assert.equal(await readFile(join(target, 'node_modules', 'sentinel'), 'utf8'), 'previous\n');
    assert.equal(await exists(join(source, 'node_modules')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects an install target inside the source package directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-setup-boundary-'));
  try {
    const source = join(root, 'source');
    await mkdir(source);
    await writeFile(join(source, 'package.json'), '{"name":"pi-agent-packages"}\n');
    await writeFile(join(source, 'package-lock.json'), '{"name":"pi-agent-packages","lockfileVersion":3}\n');

    await assert.rejects(
      prepare({ packageSource: source, packageTarget: join(source, 'install') }),
      /outside packageSource/,
    );
    assert.equal(await exists(join(source, 'install')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
