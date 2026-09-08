import assert from 'node:assert/strict';
import { access, copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
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

const miseWhich = async (tool, cacheDirectory) => {
  const mise = process.env.MISE_BIN ?? 'mise';
  const { stdout } = await execFileAsync(mise, ['which', tool], {
    env: { ...process.env, MISE_CACHE_DIR: cacheDirectory },
  });
  const executable = stdout.trim();
  if (!executable || !executable.startsWith('/')) {
    throw new Error(`mise which ${tool} did not return an absolute executable path: ${executable}`);
  }
  await access(executable, constants.X_OK);
  return executable;
};

const loadExtension = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-lsp-diagnostics-extension-'));
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
  return runner;
};

const readRegistryEntries = async (directory) => {
  let files;
  try {
    files = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const entries = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.json')) continue;
    const parsed = JSON.parse(await readFile(join(directory, file.name), 'utf8'));
    entries.push(...parsed.processes);
  }
  return entries;
};

const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};

const waitForExit = async (pids) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isRunning(pid))) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.deepEqual(pids.filter(isRunning), [], 'LSP child process remained alive after shutdown');
};

test('reports a known type diagnostic through each managed language server', { timeout: 120_000 }, async (t) => {
  if (packageRoot === undefined) {
    t.skip('PI_PACKAGE_ROOT is required for the real Pi LSP diagnostic test');
    return;
  }
  if (!(await packageExists())) {
    throw new Error(`Pi package root is unavailable: ${packageRoot}`);
  }

  const miseCache = await mkdtemp(join(tmpdir(), 'pi-lsp-diagnostics-mise-cache-'));
  let executablePaths;
  try {
    executablePaths = await Promise.all([
      miseWhich('node', miseCache),
      miseWhich('vtsls', miseCache),
      miseWhich('pyright-langserver', miseCache),
      miseWhich('gopls', miseCache),
      miseWhich('rust-analyzer', miseCache),
      miseWhich('go', miseCache),
      miseWhich('cargo', miseCache),
    ]);
  } finally {
    await rm(miseCache, { recursive: true, force: true });
  }
  const [nodePath, vtslsPath, pyrightPath, goplsPath, rustAnalyzerPath, goPath, cargoPath] = executablePaths;
  const originalHome = process.env.HOME ?? homedir();
  const rustupHome = process.env.RUSTUP_HOME ?? join(originalHome, '.rustup');
  await access(rustupHome);

  const home = await mkdtemp(join(tmpdir(), 'pi-lsp-diagnostics-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'pi-lsp-diagnostics-project-'));
  const sourceDirectory = join(cwd, 'src');
  await mkdir(join(home, '.pi', 'agent'), { recursive: true });
  await mkdir(sourceDirectory, { recursive: true });
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
  const sourceFiles = {
    vtsls: join(cwd, 'type-error.ts'),
    pyright: join(cwd, 'type-error.py'),
    gopls: join(cwd, 'type-error.go'),
    'rust-analyzer': join(sourceDirectory, 'main.rs'),
  };
  await writeFile(sourceFiles.vtsls, 'const value: number = "text";\n');
  await writeFile(sourceFiles.pyright, 'value: int = "text"\n');
  await writeFile(join(cwd, 'go.mod'), 'module diagnostic.example\n\ngo 1.27\n');
  await writeFile(sourceFiles.gopls, 'package main\n\nvar value int = "text"\n');
  await writeFile(join(cwd, 'Cargo.toml'), '[package]\nname = "diagnostic_fixture"\nversion = "0.1.0"\nedition = "2021"\n');
  await writeFile(sourceFiles['rust-analyzer'], 'fn main() {\n    let value: i32 = "text";\n}\n');

  const runtimePath = [
    dirname(nodePath),
    dirname(vtslsPath),
    dirname(pyrightPath),
    dirname(goplsPath),
    dirname(rustAnalyzerPath),
    dirname(goPath),
    dirname(cargoPath),
    process.env.PATH,
  ].filter(Boolean).join(delimiter);
  let loaded;
  let runner;
  let started = false;
  const childPids = [];
  const errors = [];
  const registryDirectory = join(home, '.pi', 'agent', 'lsp', 'pids');
  const rememberChildPids = async () => {
    const entries = await readRegistryEntries(registryDirectory);
    for (const entry of entries) {
      if (!childPids.includes(entry.pid)) childPids.push(entry.pid);
    }
    return entries;
  };
  const shutdownAndVerify = async (reason) => {
    if (!runner || !started) return;
    await rememberChildPids();
    const errorsBeforeShutdown = errors.length;
    await runner.emit({ type: 'session_shutdown', reason });
    const shutdownErrors = errors.slice(errorsBeforeShutdown);
    assert.deepEqual(shutdownErrors, [], shutdownErrors.map((error) => error.error).join('\n'));
    assert.deepEqual(await readRegistryEntries(registryDirectory), []);
    await waitForExit(childPids);
    started = false;
  };
  try {
    loaded = await loadExtension();
    runner = await loadPiRunner(loaded.factory, loaded.extensionPath, cwd);
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

    await withEnvironment({
      HOME: home,
      PATH: runtimePath,
      PI_PACKAGE_ROOT: packageRoot,
      RUSTUP_HOME: rustupHome,
    }, async () => {
      initTheme('dark', false);
      await runner.emit({ type: 'session_start', reason: 'startup' });
      assert.equal(errors.length, 0, errors.map((error) => error.error).join('\n'));
      started = true;

      const diagnostics = [
        {
          serverId: 'vtsls',
          expected: /Type 'string' is not assignable to type 'number'|2322/u,
        },
        {
          serverId: 'pyright',
          expected: /not assignable.*int|Literal.*str|str.*int/u,
        },
        {
          serverId: 'gopls',
          expected: /cannot use .* as int|cannot use/u,
        },
        {
          serverId: 'rust-analyzer',
          expected: /mismatched types|expected .*i32|found .*str/u,
        },
      ];
      for (const diagnostic of diagnostics) {
        let result;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          result = await runner.getToolDefinition('lsp_diagnostics').execute(
            `diagnostic-${diagnostic.serverId}`,
            { filePath: sourceFiles[diagnostic.serverId] },
            undefined,
            undefined,
            runner.createContext(),
          );
          if (!result.details.ok || result.details.items.length > 0) break;
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
        }
        assert.equal(result.details.ok, true, result.content[0].text);
        assert.ok(result.details.items.length > 0, `${diagnostic.serverId} returned no diagnostics`);
        assert.match(result.content[0].text, diagnostic.expected, diagnostic.serverId);
        await rememberChildPids();
      }

      const registered = await rememberChildPids();
      assert.deepEqual(
        registered.map((entry) => entry.serverId).sort(),
        ['gopls', 'pyright', 'rust-analyzer', 'vtsls'],
      );
      for (const entry of registered) {
        assert.equal(entry.ownerPid, process.pid, entry.serverId);
        assert.equal(isRunning(entry.pid), true, entry.serverId);
      }

      await shutdownAndVerify('quit');
    });
  } finally {
    let shutdownError;
    try {
      await shutdownAndVerify('test-cleanup');
    } catch (error) {
      shutdownError = error;
    } finally {
      if (loaded) await loaded.cleanup();
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
    if (shutdownError) throw shutdownError;
  }
});
