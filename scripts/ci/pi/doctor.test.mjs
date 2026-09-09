import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { checkPiInstallation } from '../../pi/doctor.mjs';
import { createManagedSkills } from './fixtures/managed-skills.mjs';

const PI_PACKAGE = '@earendil-works/pi-coding-agent';
const LSP_PACKAGE = 'pi-lsp-adapter';
const PI_VERSION = '0.85.1';
const LSP_VERSION = '0.1.3';
const ADAPTER_MODULES = [
  'src/config/loadConfig.ts',
  'src/install/manager.ts',
  'src/install/lockfile.ts',
  'src/lsp/processRegistry.ts',
  'src/lsp/runtimeManager.ts',
  'src/commands/registerCommands.ts',
  'src/tools/registerLspTools.ts',
  'src/tools/registerLspWarmup.ts',
  'src/tools/resultCache.ts',
  'src/statusLine.ts',
];

const writeJson = async (path, value) => writeFile(path, `${JSON.stringify(value)}\n`);

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-doctor-'));
  const source = join(root, 'source');
  const sourcePackages = join(source, 'dot_pi', 'agent', 'packages');
  const target = join(root, 'cache', 'pi', 'agent', 'packages');
  const home = join(root, 'home');
  const piTarget = join(target, 'node_modules', ...PI_PACKAGE.split('/'));
  const lspTarget = join(target, 'node_modules', LSP_PACKAGE);
  const tomlTarget = join(target, 'node_modules', 'smol-toml');
  const wrapper = join(home, '.local', 'bin', 'pi');
  const piLink = join(home, '.pi', 'bin', 'pi');

  await mkdir(sourcePackages, { recursive: true });
  await mkdir(join(piTarget, 'dist', 'bundle'), { recursive: true });
  await mkdir(lspTarget, { recursive: true });
  await mkdir(join(tomlTarget, 'dist'), { recursive: true });
  await writeJson(join(tomlTarget, 'package.json'), { name: 'smol-toml', version: '1.8.0' });
  await writeFile(join(tomlTarget, 'dist', 'index.cjs'), 'module.exports = {};\n');
  await mkdir(join(home, '.local', 'bin'), { recursive: true });
  await mkdir(join(home, '.pi', 'bin'), { recursive: true });
  await createManagedSkills(join(home, '.agents', 'skills'));

  const dependencies = {
    [PI_PACKAGE]: PI_VERSION,
    [LSP_PACKAGE]: LSP_VERSION,
    'smol-toml': '1.8.0',
  };
  await writeJson(join(sourcePackages, 'package.json'), {
    name: 'pi-agent-packages',
    private: true,
    version: '1.0.0',
    type: 'module',
    dependencies,
  });
  await writeJson(join(sourcePackages, 'package-lock.json'), {
    name: 'pi-agent-packages',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { dependencies },
      [`node_modules/${PI_PACKAGE}`]: { version: PI_VERSION },
      [`node_modules/${LSP_PACKAGE}`]: { version: LSP_VERSION },
      'node_modules/smol-toml': { version: '1.8.0' },
    },
  });
  await writeFile(join(piTarget, 'dist', 'bundle', 'cli.js'), '#!/usr/bin/env node\n');
  await writeJson(join(piTarget, 'package.json'), {
    name: PI_PACKAGE,
    version: PI_VERSION,
  });
  await writeJson(join(lspTarget, 'package.json'), {
    name: LSP_PACKAGE,
    version: LSP_VERSION,
  });
  for (const modulePath of ADAPTER_MODULES) {
    const path = join(lspTarget, modulePath);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '// fixture module\n');
  }
  await writeFile(wrapper, '#!/bin/sh\nprintf \'0.85.1\\n\'\n');
  await chmod(wrapper, 0o755);
  await symlink('../../.local/bin/pi', piLink);

  return {
    root,
    source,
    target,
    home,
    wrapper,
    piLink,
    env: {
      ...process.env,
      HOME: home,
      XDG_CACHE_HOME: join(root, 'cache'),
      PI_PACKAGE_TARGET: target,
    },
  };
};

test('Pi doctor accepts a complete external install and managed wrapper', async () => {
  const fixture = await createFixture();
  try {
    const result = await checkPiInstallation({ sourceRoot: fixture.source, env: fixture.env });
    assert.equal(result.packageTarget, fixture.target);
    assert.equal(result.piVersion, PI_VERSION);
    assert.equal(result.adapterVersion, LSP_VERSION);
    assert.equal(result.wrapperVersion, PI_VERSION);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Pi doctor reports a missing TOML parser entry before launch', async () => {
  const fixture = await createFixture();
  try {
    await rm(join(fixture.target, 'node_modules', 'smol-toml', 'dist', 'index.cjs'));
    await assert.rejects(
      checkPiInstallation({ sourceRoot: fixture.source, env: fixture.env }),
      /Missing required Pi file: .*smol-toml.*index.cjs/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Pi doctor reports a missing managed skill helper before launch', async () => {
  const fixture = await createFixture();
  try {
    await rm(join(fixture.home, '.agents', 'skills', 'todo-management', 'scripts', 'todo-path'));
    await assert.rejects(
      checkPiInstallation({ sourceRoot: fixture.source, env: fixture.env }),
      /managed skill resource is missing: .*todo-path/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Pi doctor rejects a stale installed Pi version', async () => {
  const fixture = await createFixture();
  try {
    await writeJson(join(fixture.target, 'node_modules', ...PI_PACKAGE.split('/'), 'package.json'), {
      name: PI_PACKAGE,
      version: '0.85.0',
    });
    await assert.rejects(
      checkPiInstallation({ sourceRoot: fixture.source, env: fixture.env }),
      error => {
        assert.match(error.message, /Pi package version mismatch/u);
        assert.match(error.message, /expected 0\.85\.1/u);
        assert.match(error.message, /installed 0\.85\.0/u);
        return true;
      },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Pi doctor reports a missing adapter runtime file', async () => {
  const fixture = await createFixture();
  try {
    await rm(join(
      fixture.target,
      'node_modules',
      LSP_PACKAGE,
      'src/config/loadConfig.ts',
    ));
    await assert.rejects(
      checkPiInstallation({ sourceRoot: fixture.source, env: fixture.env }),
      error => {
        assert.match(error.message, /Missing required Pi file/u);
        assert.match(error.message, /pi-lsp-adapter[\\/]src[\\/]config[\\/]loadConfig\.ts/u);
        return true;
      },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Pi doctor rejects a second wrapper path', async () => {
  const fixture = await createFixture();
  try {
    const wrongWrapper = join(fixture.root, 'wrong-pi');
    await writeFile(wrongWrapper, '#!/bin/sh\nprintf \'0.85.1\\n\'\n');
    await chmod(wrongWrapper, 0o755);
    await rm(fixture.piLink);
    await symlink(wrongWrapper, fixture.piLink);

    await assert.rejects(
      checkPiInstallation({ sourceRoot: fixture.source, env: fixture.env }),
      error => {
        assert.match(error.message, /wrapper paths do not resolve to the same managed wrapper/u);
        return true;
      },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
