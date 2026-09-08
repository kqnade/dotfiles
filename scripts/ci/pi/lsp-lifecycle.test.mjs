import assert from 'node:assert/strict';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { credential, listen } from '../../../dot_pi/agent/runtime/ipc.mjs';
import { test } from 'node:test';

import {
  assertLspReady,
  createLspAdmission,
  registerLspLifecycle,
  withLspHandoff,
} from '../../../dot_pi/agent/runtime/lsp-lifecycle.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
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

const waitFor = async (read, predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error('condition was not reached before timeout');
};

const readEvents = async (logPath) => {
  try {
    return (await readFile(logPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const packageExists = async () => {
  if (!packageRoot) return false;
  try {
    await lstat(join(packageRoot, 'node_modules'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

const loadCombinedExtensions = async () => {
  const root = await mkdtemp(join('/tmp', 'pi-lsp-lifecycle-extension-'));
  await mkdir(join(root, 'extensions'), { recursive: true });
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await symlink(join(repositoryRoot, 'dot_pi', 'agent', 'runtime'), join(root, 'runtime'), 'dir');
  await symlink(join(packageRoot, 'node_modules', 'typebox'), join(root, 'node_modules', 'typebox'));
  const paths = {
    lsp: join(root, 'extensions', 'lsp.ts'),
    managed: join(root, 'extensions', 'managed.ts'),
  };
  await copyFile(join(repositoryRoot, 'dot_pi', 'agent', 'extensions', 'lsp.ts'), paths.lsp);
  await copyFile(join(repositoryRoot, 'dot_pi', 'agent', 'extensions', 'managed.ts'), paths.managed);

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
  const [lsp, managed] = await Promise.all([
    jiti.import(paths.lsp, { default: true }),
    jiti.import(paths.managed, { default: true }),
  ]);

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
  const eventBus = createEventBus();
  const extensions = await Promise.all([
    loadExtensionFromFactory(managed, root, eventBus, runtime, paths.managed),
    loadExtensionFromFactory(lsp, root, eventBus, runtime, paths.lsp),
  ]);
  const runner = new ExtensionRunner(extensions, runtime, root, {}, {});
  runner.setUIContext({
    theme: { fg: (_color, text) => text },
    notify() {},
    setStatus() {},
  }, 'print');

  return {
    root,
    runner,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
};

const readRegistry = async (directory) => {
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

test('draining closes admission, waits for operations, and shuts down after quiescence', async () => {
  const events = [];
  const operation = deferred();
  const manager = {
    async warmupFile() {
      events.push('warmup-start');
      await operation.promise;
      events.push('warmup-end');
      return true;
    },
    syncValue() {
      return 7;
    },
    async shutdown() {
      events.push('shutdown');
    },
    activeClients() {
      return [];
    },
  };
  const admission = createLspAdmission(manager);

  assert.equal(admission.manager.syncValue(), 7);
  const running = admission.manager.warmupFile('source.ts');
  await tick();
  const shuttingDown = admission.shutdown();
  await tick();

  assert.deepEqual(events, ['warmup-start']);
  await assert.rejects(
    admission.manager.warmupFile('later.ts'),
    /LSP runtime is draining/u,
  );

  operation.resolve();
  await running;
  await shuttingDown;
  assert.deepEqual(events, ['warmup-start', 'warmup-end', 'shutdown']);
});

test('tracks concurrent starts and warmups before shutdown', async () => {
  const events = [];
  const startOperation = deferred();
  const warmupOperation = deferred();
  const manager = {
    async startServer() {
      events.push('start');
      await startOperation.promise;
    },
    async warmupFile() {
      events.push('warmup');
      await warmupOperation.promise;
    },
    async shutdown() {
      events.push('shutdown');
    },
    activeClients() {
      return [];
    },
  };
  const admission = createLspAdmission(manager);

  const starting = admission.manager.startServer('vtsls');
  const warming = admission.manager.warmupFile('source.ts');
  await tick();
  const shuttingDown = admission.shutdown();
  await tick();

  assert.deepEqual(events, ['start', 'warmup']);
  assert.equal(admission.status().phase, 'draining');
  assert.equal(admission.status().pending, 2);

  startOperation.resolve();
  warmupOperation.resolve();
  await Promise.all([starting, warming, shuttingDown]);
  assert.deepEqual(events, ['start', 'warmup', 'shutdown']);
  assert.deepEqual(admission.status(), { phase: 'stopped', pending: 0 });
});

test('handoff does not dispatch the operation when preparation fails', async () => {
  let dispatches = 0;
  const unregister = registerLspLifecycle({
    async beforeHandoff() {
      throw new Error('LSP shutdown failed');
    },
    async afterHandoff() {
      throw new Error('must not recreate after a failed preparation');
    },
    assertReady() {},
  });
  try {
    await assert.rejects(
      withLspHandoff(async () => {
        dispatches += 1;
      }),
      /LSP shutdown failed/u,
    );
    assert.equal(dispatches, 0);
  } finally {
    unregister();
  }
});

test('handoff waits for recreation and preserves operation failure', async () => {
  const events = [];
  const unregister = registerLspLifecycle({
    async beforeHandoff() {
      events.push('before');
    },
    async afterHandoff() {
      events.push('after-start');
      await tick();
      events.push('after-end');
    },
    assertReady() {},
  });
  try {
    await assert.rejects(
      withLspHandoff(async () => {
        events.push('operation');
        throw new Error('delegate failed');
      }),
      /delegate failed/u,
    );
    assert.deepEqual(events, ['before', 'operation', 'after-start', 'after-end']);
    assert.doesNotThrow(() => assertLspReady());
  } finally {
    unregister();
  }
});

test('handoff can deliberately leave a stopped delegated role closed', async () => {
  let handoffOptions;
  const unregister = registerLspLifecycle({
    async beforeHandoff() {},
    async afterHandoff(options) {
      handoffOptions = options;
    },
    assertReady() {},
  });
  try {
    await withLspHandoff(async () => 'escalated', { resume: false });
    assert.deepEqual(handoffOptions, { resume: false, operationError: undefined });
  } finally {
    unregister();
  }
});

test('loaded managed and LSP extensions drain before delegate and recreate afterward', { timeout: 30_000 }, async (t) => {
  if (!packageRoot) {
    t.skip('PI_PACKAGE_ROOT is required for the loaded lifecycle test');
    return;
  }
  if (!(await packageExists())) {
    throw new Error(`Pi package root is unavailable: ${packageRoot}`);
  }

  const root = await mkdtemp(join('/tmp', 'pi-lsp-loaded-lifecycle-'));
  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const bin = join(root, 'bin');
  const logPath = join(root, 'lsp.log');
  const releasePath = join(root, 'release');
  const registryDirectory = join(home, '.pi', 'agent', 'lsp', 'pids');
  const fixture = join(repositoryRoot, 'scripts', 'ci', 'pi', 'fixtures', 'lsp-delay.mjs');
  const fixtureCopy = join(root, 'lsp-delay.mjs');
  const socketPath = join(root, 'broker.sock');
  const agentId = 'root-agent';
  const masterToken = randomBytes(32).toString('hex');
  let server;
  let loaded;
  let sessionStarted = false;
  let pendingLsp;
  let pendingDelegate;

  try {
    await mkdir(join(home, '.pi', 'agent'), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await mkdir(bin, { recursive: true });
    await writeFile(join(cwd, 'symbols.ts'), 'export const value = 1;\n');
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
    await copyFile(fixture, fixtureCopy);
    await chmod(fixtureCopy, 0o755);
    for (const command of ['vtsls', 'pyright-langserver', 'gopls', 'rust-analyzer']) {
      await symlink(fixtureCopy, join(bin, command));
    }

    const requests = [];
    server = await listen({
      socketPath,
      token: masterToken,
      handle: async (method, _params, identity) => {
        assert.equal(identity.agentId, agentId);
        requests.push(method);
        if (method === 'permit') return { id: agentId, role: 'root' };
        if (method !== 'delegate') throw new Error(`unexpected broker method: ${method}`);

        const events = await readEvents(logPath);
        assert.ok(events.some((event) => event.event === 'exit'), 'LSP process did not exit before delegate dispatch');
        assert.deepEqual(await readRegistry(registryDirectory), [], 'LSP registry was not empty before delegate dispatch');
        return [{ result: { text: 'delegated' } }];
      },
    });

    await withEnvironment({
      HOME: home,
      PATH: [bin, dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
      PI_PACKAGE_ROOT: packageRoot,
      PI_BROKER_SOCKET: socketPath,
      PI_AGENT_ID: agentId,
      PI_AGENT_TOKEN: credential(masterToken, agentId),
      PI_AGENT_ROLE: 'root',
      PI_LSP_FIXTURE_LOG: logPath,
      PI_LSP_FIXTURE_RELEASE: releasePath,
    }, async () => {
      try {
        loaded = await loadCombinedExtensions();
        const errors = [];
        loaded.runner.onError((error) => errors.push(error));
        sessionStarted = true;
        await loaded.runner.emit({ type: 'session_start', reason: 'startup' });

        const lsp = loaded.runner.getToolDefinition('lsp_workspace_symbols');
        const delegate = loaded.runner.getToolDefinition('delegate');
        assert.ok(lsp);
        assert.ok(delegate);

        pendingLsp = lsp.execute(
          'lsp-before-delegate',
          { query: 'value', serverId: 'vtsls' },
          undefined,
          undefined,
          loaded.runner.createContext(),
        );
        await waitFor(
          async () => readEvents(logPath),
          (events) => events.some((event) => event.event === 'workspace-symbol-start'),
        );

        pendingDelegate = delegate.execute(
          'delegate-after-lsp',
          { tasks: [{ role: 'astra', task: 'delegate', paths: ['symbols.ts'] }] },
          undefined,
          undefined,
          loaded.runner.createContext(),
        );
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
        assert.equal(requests.includes('delegate'), false, 'delegate dispatched before LSP drain');

        await writeFile(releasePath, 'release\n');
        const [lspResult, delegateResult] = await Promise.all([pendingLsp, pendingDelegate]);
        assert.equal(lspResult.details.ok, true);
        assert.equal(delegateResult.details[0].result.text, 'delegated');
        assert.deepEqual(errors, []);

        const resumedResult = await lsp.execute(
          'lsp-after-delegate',
          { query: 'value', serverId: 'vtsls' },
          undefined,
          undefined,
          loaded.runner.createContext(),
        );
        assert.equal(resumedResult.details.ok, true);
        const starts = (await readEvents(logPath)).filter((event) => event.event === 'initialize');
        assert.equal(starts.length, 2, 'delegate did not recreate a fresh LSP manager');
        assert.deepEqual(errors, []);
      } finally {
        try {
          await writeFile(releasePath, 'release\n');
        } finally {
          try {
            await Promise.allSettled([pendingLsp, pendingDelegate].filter(Boolean));
          } finally {
            if (sessionStarted && loaded) {
              await loaded.runner.emit({ type: 'session_shutdown', reason: 'quit' });
            }
          }
        }
      }
    });
  } finally {
    await loaded?.cleanup();
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
