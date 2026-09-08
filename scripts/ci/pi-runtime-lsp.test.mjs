import assert from 'node:assert/strict';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = process.env.PI_PACKAGE_ROOT;

const withEnvironment = async (values, action) => {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const packageExists = async () => {
  if (packageRoot === undefined) return false;
  try {
    await lstat(join(packageRoot, 'node_modules'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

const loadExtension = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-lsp-extension-'));
  await mkdir(join(root, 'extensions'), { recursive: true });
  await mkdir(join(root, 'packages'), { recursive: true });
  await symlink(join(packageRoot, 'node_modules'), join(root, 'packages', 'node_modules'), 'dir');
  const extensionPath = join(root, 'extensions', 'lsp.ts');
  await copyFile(join(repositoryRoot, 'dot_pi', 'agent', 'extensions', 'lsp.ts'), extensionPath);

  const jitiPath = join(
    packageRoot,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'node_modules',
    'jiti',
    'lib',
    'jiti.mjs',
  );
  const { createJiti } = await import(pathToFileURL(jitiPath).href);
  const jiti = createJiti(import.meta.url);
  const factory = await jiti.import(extensionPath, { default: true });

  return {
    factory,
    extensionPath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
};

const loadPiExtension = async (factory, extensionPath) => {
  const loaderPath = join(
    packageRoot,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'dist',
    'core',
    'extensions',
    'loader.js',
  );
  const eventBusPath = join(
    packageRoot,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'dist',
    'core',
    'event-bus.js',
  );
  const [{ createExtensionRuntime, loadExtensionFromFactory }, { createEventBus }] = await Promise.all([
    import(pathToFileURL(loaderPath).href),
    import(pathToFileURL(eventBusPath).href),
  ]);
  return loadExtensionFromFactory(
    factory,
    repositoryRoot,
    createEventBus(),
    createExtensionRuntime(),
    extensionPath,
  );
};

const loadPiRunner = async (factory, extensionPath, cwd) => {
  const loaderPath = join(
    packageRoot,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'dist',
    'core',
    'extensions',
    'loader.js',
  );
  const runnerPath = join(
    packageRoot,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'dist',
    'core',
    'extensions',
    'runner.js',
  );
  const eventBusPath = join(
    packageRoot,
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'dist',
    'core',
    'event-bus.js',
  );
  const [{ createExtensionRuntime, loadExtensionFromFactory }, { ExtensionRunner }, { createEventBus }] = await Promise.all([
    import(pathToFileURL(loaderPath).href),
    import(pathToFileURL(runnerPath).href),
    import(pathToFileURL(eventBusPath).href),
  ]);
  const runtime = createExtensionRuntime();
  const extension = await loadExtensionFromFactory(
    factory,
    cwd,
    createEventBus(),
    runtime,
    extensionPath,
  );
  const runner = new ExtensionRunner([extension], runtime, cwd, {}, {});
  runner.setUIContext(undefined, 'print');
  return { extension, runner };
};

const requirePackage = async (t) => {
  if (packageRoot === undefined) {
    t.skip('PI_PACKAGE_ROOT is required for the Pi LSP runtime test');
    return false;
  }
  if (!(await packageExists())) {
    throw new Error(`Pi package root is unavailable: ${packageRoot}`);
  }
  return true;
};

test('keeps the seven LSP read tools and permits only status and doctor routes', async (t) => {
  if (!(await requirePackage(t))) return;

  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  process.env.PI_PACKAGE_ROOT = packageRoot;
  const loaded = await loadExtension();
  try {
    const extension = await loadPiExtension(loaded.factory, loaded.extensionPath);
    assert.deepEqual([...extension.tools.keys()].sort(), [
      'lsp_definition',
      'lsp_diagnostics',
      'lsp_document_symbols',
      'lsp_hover',
      'lsp_more',
      'lsp_references',
      'lsp_workspace_symbols',
    ]);

    const command = extension.commands.get('lsp');
    assert.ok(command);
    assert.equal(command.description, 'Show read-only LSP status or diagnostics');
    const context = { hasUI: false, ui: { notify() {} } };
    await assert.doesNotReject(() => command.handler('status', context));
    await assert.doesNotReject(() => command.handler('doctor vtsls', context));

    for (const route of ['', 'install vtsls', 'update vtsls', 'uninstall vtsls', 'trust', 'untrust', 'stop', 'start', 'restart']) {
      await assert.rejects(
        () => command.handler(route, context),
        /Only \/lsp status and \/lsp doctor are available/u,
        `expected route to be rejected: /lsp ${route}`,
      );
    }
  } finally {
    await loaded.cleanup();
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
  }
});

test('provisions only configured system servers in an isolated home', async (t) => {
  if (!(await requirePackage(t))) return;

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-project-'));
  const bin = await mkdtemp(join(tmpdir(), 'pi-lsp-bin-'));
  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  try {
    await mkdir(join(home, '.pi', 'agent'), { recursive: true });
    await mkdir(join(cwd, '.pi'), { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
      installMode: 'off',
      warmup: false,
      servers: {
        vtsls: { command: ['vtsls', '--stdio'], install: { type: 'system', command: ['vtsls', '--stdio'] } },
        pyright: { command: ['pyright-langserver', '--stdio'], install: { type: 'system', command: ['pyright-langserver', '--stdio'] } },
        gopls: { command: ['gopls'], install: { type: 'system', command: ['gopls'] } },
        'rust-analyzer': { command: ['rust-analyzer'], install: { type: 'system', command: ['rust-analyzer'] } },
      },
    }));
    for (const command of ['vtsls', 'pyright-langserver', 'gopls', 'rust-analyzer']) {
      const path = join(bin, command);
      await symlink(process.execPath, path);
    }

    process.env.PI_PACKAGE_ROOT = packageRoot;
    const loaded = await loadExtension();
    try {
      const { runner } = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
      const errors = [];
      runner.onError((error) => errors.push(error));
      const statuses = [];
      runner.setUIContext({
        theme: { fg: (_color, text) => text },
        notify() {},
        setStatus: (...args) => statuses.push(args),
      }, 'print');
      const piModulePath = join(
        packageRoot,
        'node_modules',
        '@earendil-works',
        'pi-coding-agent',
        'dist',
        'index.js',
      );
      const { initTheme } = await import(pathToFileURL(piModulePath).href);

      await withEnvironment({
        HOME: home,
        PATH: bin,
        PI_PACKAGE_ROOT: packageRoot,
      }, async () => {
        initTheme('dark', false);
        await runner.emit({ type: 'session_start', reason: 'startup' });
        const lockfile = JSON.parse(await readFile(join(home, '.pi', 'agent', 'lsp', 'lsp.lock.json'), 'utf8'));
        assert.deepEqual(Object.keys(lockfile.servers).sort(), ['gopls', 'pyright', 'rust-analyzer', 'vtsls']);
        for (const [serverId, metadata] of Object.entries(lockfile.servers)) {
          assert.equal(metadata.installer, 'system', serverId);
          assert.equal(metadata.resolvedCommand[0].startsWith(bin), true, serverId);
        }
        await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
          servers: {
            vtsls: {
              command: ['vtsls', '--stdio'],
              install: { type: 'npm', packages: { vtsls: '1.0.0' }, bin: 'vtsls' },
            },
          },
        }));
        await runner.emit({ type: 'session_start', reason: 'reload' });
        assert.equal(errors.length, 1);
        assert.match(errors[0].error, /Refusing non-system LSP installer for vtsls/u);
        const diagnostics = await runner.getToolDefinition('lsp_diagnostics').execute(
          'failed-reload',
          { filePath: 'missing.ts' },
          undefined,
          undefined,
          runner.createContext(),
        );
        assert.match(diagnostics.content[0].text, /LSP extension is not initialized/u);
        await runner.emit({ type: 'session_shutdown', reason: 'quit' });
      });
      assert.ok(statuses.length > 0);
    } finally {
      await loaded.cleanup();
    }
  } finally {
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test('fails closed before provisioning when a managed server is not system-installed', async (t) => {
  if (!(await requirePackage(t))) return;

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-invalid-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-invalid-project-'));
  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  try {
    await mkdir(join(home, '.pi', 'agent'), { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
      servers: {
        vtsls: {
          command: ['vtsls', '--stdio'],
          install: { type: 'npm', packages: { vtsls: '1.0.0' }, bin: 'vtsls' },
        },
      },
    }));

    process.env.PI_PACKAGE_ROOT = packageRoot;
    const loaded = await loadExtension();
    try {
      const { runner } = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
      const errors = [];
      runner.onError((error) => errors.push(error));

      await withEnvironment({ HOME: home, PI_PACKAGE_ROOT: packageRoot }, async () => {
        await runner.emit({ type: 'session_start', reason: 'startup' });
        assert.equal(errors.length, 1);
        assert.match(errors[0].error, /Refusing non-system LSP installer for vtsls/u);
        await assert.rejects(
          () => readFile(join(home, '.pi', 'agent', 'lsp', 'lsp.lock.json'), 'utf8'),
          /ENOENT/u,
        );
        const diagnostics = await runner.getToolDefinition('lsp_diagnostics').execute(
          'failed-session',
          { filePath: 'missing.ts' },
          undefined,
          undefined,
          runner.createContext(),
        );
        assert.match(diagnostics.content[0].text, /LSP extension is not initialized/u);
      });
    } finally {
      await loaded.cleanup();
    }
  } finally {
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('rejects a trusted project command override for a managed system server', async (t) => {
  if (!(await requirePackage(t))) return;

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-command-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-command-project-'));
  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  try {
    await mkdir(join(home, '.pi', 'agent', 'lsp'), { recursive: true });
    await mkdir(join(cwd, '.pi'), { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
      servers: {
        vtsls: { command: ['vtsls', '--stdio'], install: { type: 'system', command: ['vtsls', '--stdio'] } },
        pyright: { command: ['pyright-langserver', '--stdio'], install: { type: 'system', command: ['pyright-langserver', '--stdio'] } },
        gopls: { command: ['gopls'], install: { type: 'system', command: ['gopls'] } },
        'rust-analyzer': { command: ['rust-analyzer'], install: { type: 'system', command: ['rust-analyzer'] } },
      },
    }));
    await writeFile(join(cwd, '.pi', 'lsp.json'), JSON.stringify({
      servers: {
        vtsls: { command: ['untrusted-command'], install: { type: 'system', command: ['untrusted-command'] } },
      },
    }));
    await writeFile(join(home, '.pi', 'agent', 'lsp', 'trust.json'), JSON.stringify({ trustedProjects: [cwd] }));

    process.env.PI_PACKAGE_ROOT = packageRoot;
    const loaded = await loadExtension();
    try {
      const { runner } = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
      const errors = [];
      runner.onError((error) => errors.push(error));

      await withEnvironment({ HOME: home, PI_PACKAGE_ROOT: packageRoot }, async () => {
        await runner.emit({ type: 'session_start', reason: 'startup' });
        assert.equal(errors.length, 1);
        assert.match(errors[0].error, /Refusing overridden LSP command for vtsls/u);
        await assert.rejects(
          () => readFile(join(home, '.pi', 'agent', 'lsp', 'lsp.lock.json'), 'utf8'),
          /ENOENT/u,
        );
      });
    } finally {
      await loaded.cleanup();
    }
  } finally {
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('rejects a trusted per-server NODE_OPTIONS override for a managed system server', async (t) => {
  if (!(await requirePackage(t))) return;

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-env-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-env-project-'));
  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  try {
    await mkdir(join(home, '.pi', 'agent', 'lsp'), { recursive: true });
    await mkdir(join(cwd, '.pi'), { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
      servers: {
        vtsls: { command: ['vtsls', '--stdio'], install: { type: 'system', command: ['vtsls', '--stdio'] } },
        pyright: { command: ['pyright-langserver', '--stdio'], install: { type: 'system', command: ['pyright-langserver', '--stdio'] } },
        gopls: { command: ['gopls'], install: { type: 'system', command: ['gopls'] } },
        'rust-analyzer': { command: ['rust-analyzer'], install: { type: 'system', command: ['rust-analyzer'] } },
      },
    }));
    await writeFile(join(cwd, '.pi', 'lsp.json'), JSON.stringify({
      servers: {
        vtsls: { env: { NODE_OPTIONS: '--require /tmp/untrusted-loader.cjs' } },
      },
    }));
    await writeFile(join(home, '.pi', 'agent', 'lsp', 'trust.json'), JSON.stringify({ trustedProjects: [cwd] }));

    process.env.PI_PACKAGE_ROOT = packageRoot;
    const loaded = await loadExtension();
    try {
      const { runner } = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
      const errors = [];
      runner.onError((error) => errors.push(error));

      await withEnvironment({ HOME: home, PI_PACKAGE_ROOT: packageRoot }, async () => {
        await runner.emit({ type: 'session_start', reason: 'startup' });
        assert.equal(errors.length, 1);
        assert.match(errors[0].error, /Refusing per-server environment override for vtsls/u);
        await assert.rejects(
          () => readFile(join(home, '.pi', 'agent', 'lsp', 'lsp.lock.json'), 'utf8'),
          /ENOENT/u,
        );
      });
    } finally {
      await loaded.cleanup();
    }
  } finally {
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('rejects a trusted project installMode override before adapter initialization', async (t) => {
  if (!(await requirePackage(t))) return;

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-mode-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-mode-project-'));
  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  try {
    await mkdir(join(home, '.pi', 'agent', 'lsp'), { recursive: true });
    await mkdir(join(cwd, '.pi'), { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
      installMode: 'off',
      servers: {
        vtsls: { command: ['vtsls', '--stdio'], install: { type: 'system', command: ['vtsls', '--stdio'] } },
        pyright: { command: ['pyright-langserver', '--stdio'], install: { type: 'system', command: ['pyright-langserver', '--stdio'] } },
        gopls: { command: ['gopls'], install: { type: 'system', command: ['gopls'] } },
        'rust-analyzer': { command: ['rust-analyzer'], install: { type: 'system', command: ['rust-analyzer'] } },
      },
    }));
    await writeFile(join(cwd, '.pi', 'lsp.json'), JSON.stringify({ installMode: 'auto' }));
    await writeFile(join(home, '.pi', 'agent', 'lsp', 'trust.json'), JSON.stringify({ trustedProjects: [cwd] }));

    process.env.PI_PACKAGE_ROOT = packageRoot;
    const loaded = await loadExtension();
    try {
      const { runner } = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
      const errors = [];
      runner.onError((error) => errors.push(error));

      await withEnvironment({ HOME: home, PI_PACKAGE_ROOT: packageRoot }, async () => {
        await runner.emit({ type: 'session_start', reason: 'startup' });
        assert.equal(errors.length, 1);
        assert.match(errors[0].error, /Refusing LSP install mode: auto/u);
        await assert.rejects(
          () => readFile(join(home, '.pi', 'agent', 'lsp', 'lsp.lock.json'), 'utf8'),
          /ENOENT/u,
        );
      });
    } finally {
      await loaded.cleanup();
    }
  } finally {
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('does not select an extra configured server from a preexisting lockfile', async (t) => {
  if (!(await requirePackage(t))) return;

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-extra-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-extra-project-'));
  const bin = await mkdtemp(join(tmpdir(), 'pi-lsp-extra-bin-'));
  const previousPackageRoot = process.env.PI_PACKAGE_ROOT;
  try {
    await mkdir(join(home, '.pi', 'agent', 'lsp'), { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'lsp.json'), JSON.stringify({
      installMode: 'off',
      warmup: false,
      servers: {
        vtsls: { command: ['vtsls', '--stdio'], install: { type: 'system', command: ['vtsls', '--stdio'] } },
        pyright: { command: ['pyright-langserver', '--stdio'], install: { type: 'system', command: ['pyright-langserver', '--stdio'] } },
        gopls: { command: ['gopls'], install: { type: 'system', command: ['gopls'] } },
        'rust-analyzer': { command: ['rust-analyzer'], install: { type: 'system', command: ['rust-analyzer'] } },
        extra: {
          displayName: 'Extra server',
          filetypes: ['typescript'],
          rootMarkers: [],
          install: { type: 'system', command: ['extra'] },
          command: ['extra'],
          settings: {},
          initializationOptions: {},
          lazy: false,
        },
      },
    }));
    await writeFile(join(home, '.pi', 'agent', 'lsp', 'lsp.lock.json'), JSON.stringify({
      servers: {
        extra: {
          installer: 'system',
          resolvedCommand: [join(bin, 'extra')],
          installedAt: new Date().toISOString(),
        },
      },
    }));
    for (const command of ['vtsls', 'pyright-langserver', 'gopls', 'rust-analyzer']) {
      await symlink(process.execPath, join(bin, command));
    }

    process.env.PI_PACKAGE_ROOT = packageRoot;
    const loaded = await loadExtension();
    try {
      const { runner } = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
      const errors = [];
      runner.onError((error) => errors.push(error));
      const piModulePath = join(
        packageRoot,
        'node_modules',
        '@earendil-works',
        'pi-coding-agent',
        'dist',
        'index.js',
      );
      const { initTheme } = await import(pathToFileURL(piModulePath).href);

      await withEnvironment({ HOME: home, PATH: bin, PI_PACKAGE_ROOT: packageRoot }, async () => {
        initTheme('dark', false);
        await runner.emit({ type: 'session_start', reason: 'startup' });
        assert.equal(errors.length, 0);
        const result = await runner.getToolDefinition('lsp_workspace_symbols').execute(
          'extra-server',
          { query: 'needle', serverId: 'extra' },
          undefined,
          undefined,
          runner.createContext(),
        );
        assert.match(result.content[0].text, /Unknown LSP server: extra/u);
        await runner.emit({ type: 'session_shutdown', reason: 'quit' });
      });
    } finally {
      await loaded.cleanup();
    }
  } finally {
    if (previousPackageRoot === undefined) delete process.env.PI_PACKAGE_ROOT;
    else process.env.PI_PACKAGE_ROOT = previousPackageRoot;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
