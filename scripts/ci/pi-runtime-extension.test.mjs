import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, realpath, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { startBroker } from '../../dot_pi/agent/runtime/broker.mjs';

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

const loadExtension = packageRoot
  ? async () => {
      const root = await mkdtemp(join(tmpdir(), 'pi-extension-loader-'));
      await mkdir(join(root, 'node_modules'), { recursive: true });
      await mkdir(join(root, 'extensions'), { recursive: true });
      await symlink(join(packageRoot, 'node_modules', 'typebox'), join(root, 'node_modules', 'typebox'));
      await symlink(join(repositoryRoot, 'dot_pi', 'agent', 'runtime'), join(root, 'runtime'), 'dir');
      const extensionPath = join(root, 'extensions', 'managed.ts');
      await copyFile(join(repositoryRoot, 'dot_pi', 'agent', 'extensions', 'managed.ts'), extensionPath);
      const module = await import(`${pathToFileURL(extensionPath).href}?test=${Date.now()}`);
      return {
        factory: module.default,
        cleanup: () => rm(root, { recursive: true, force: true }),
      };
    }
  : undefined;

const createPi = () => {
  const handlers = new Map();
  const tools = new Map();
  return {
    handlers,
    tools,
    on(event, handler) {
      const entries = handlers.get(event) ?? [];
      entries.push(handler);
      handlers.set(event, entries);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    async emit(event, payload, context = {}) {
      let result;
      for (const handler of handlers.get(event) ?? []) {
        result = await handler(payload, context);
      }
      return result;
    },
  };
};

const requirePackageRoot = (t) => {
  if (!packageRoot) {
    t.skip('PI_PACKAGE_ROOT is required for the Pi extension runtime test');
  }
};

test('formats a Go file through the Pi tool and broker with installed gofmt', {
  skip: process.platform !== 'darwin' && 'requires macOS Seatbelt',
}, async t => {
  requirePackageRoot(t);
  if (!loadExtension) return;
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-extension-format-')));
  const loaded = await loadExtension();
  let broker;
  let pi;
  try {
    await writeFile(join(cwd, 'main.go'), 'package main\nfunc main(){println("hello")}\n');
    broker = await startBroker({
      cwd, directory: join(cwd, 'journal'), command: process.execPath,
      args: [fileURLToPath(new URL('./pi/fixtures/rpc-child.mjs', import.meta.url))],
    });
    await withEnvironment({
      PI_BROKER_SOCKET: broker.connection.socketPath,
      PI_AGENT_ID: broker.connection.agentId,
      PI_AGENT_TOKEN: broker.connection.token,
      PI_AGENT_ROLE: 'root',
    }, async () => {
      pi = createPi();
      loaded.factory(pi);
      await pi.emit('session_start', { type: 'session_start', reason: 'startup' });
      const result = await pi.tools.get('format').execute('format-1', { path: 'main.go' });
      assert.equal(result.details.status, 'formatted');
      assert.equal(result.details.path, 'main.go');
      assert.deepEqual(JSON.parse(result.content[0].text), result.details);
      assert.equal(await readFile(join(cwd, 'main.go'), 'utf8'), 'package main\n\nfunc main() { println("hello") }\n');
      const repeated = await pi.tools.get('format').execute('format-2', { path: 'main.go' });
      assert.equal(repeated.details.status, 'unchanged');
      await writeFile(join(cwd, 'main.go'), 'package main\nfunc invalid(\n');
      await assert.rejects(pi.tools.get('format').execute('format-3', { path: 'main.go' }), /process exited unsuccessfully/);
      assert.equal(await readFile(join(cwd, 'main.go'), 'utf8'), 'package main\nfunc invalid(\n');
      await writeFile(join(cwd, 'notes.txt'), 'plain text');
      const skipped = await pi.tools.get('format').execute('format-4', { path: 'notes.txt' });
      assert.equal(skipped.details.status, 'skipped');
    });
  } finally {
    await pi?.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
    await broker?.close();
    await loaded.cleanup();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('loads broker-backed file, formatting, delegation, and escalation tools', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const loaded = await loadExtension();
  try {
    await withEnvironment({
      PI_BROKER_SOCKET: '/tmp/unopened.sock',
      PI_AGENT_ID: 'root',
      PI_AGENT_TOKEN: 'token',
      PI_AGENT_ROLE: 'root',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      assert.deepEqual([...pi.tools.keys()].sort(), ['delegate', 'edit', 'escalate', 'format', 'read', 'write']);
      assert.deepEqual(pi.tools.get('format').parameters.required, ['path']);
      assert.deepEqual(pi.tools.get('edit').parameters.required, ['path', 'oldText', 'newText', 'expectedHash']);
      assert.equal(pi.tools.get('edit').parameters.properties.expectedHash.type, 'string');
      assert.deepEqual(pi.tools.get('escalate').parameters.required, ['reason']);
      assert.equal(pi.tools.get('escalate').parameters.properties.reason.type, 'string');
      assert.equal(pi.handlers.get('session_start').length, 1);
      assert.equal(pi.handlers.get('session_shutdown').length, 1);
      assert.equal(pi.handlers.get('before_provider_request').length, 2);
      assert.equal(pi.handlers.get('user_bash').length, 1);
    });
  } finally {
    await loaded.cleanup();
  }
});

test('gives delegated Sol an escalation handoff prompt', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const loaded = await loadExtension();
  try {
    await withEnvironment({
      PI_BROKER_SOCKET: '/tmp/unopened.sock',
      PI_AGENT_ID: 'sol-id',
      PI_AGENT_TOKEN: 'token',
      PI_AGENT_ROLE: 'sol',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      const prompt = await pi.emit('before_agent_start', { systemPrompt: 'base' });
      assert.match(prompt.systemPrompt, /managed escalate tool/);
      assert.match(prompt.systemPrompt, /existing waiting Astra/);
      assert.match(prompt.systemPrompt, /without further edits/);
    });
  } finally {
    await loaded.cleanup();
  }
});

test('uses the authenticated broker for file tools and closes the connection twice safely', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'pi-extension-broker-')));
  let broker;
  const loaded = await loadExtension();
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    broker = await startBroker({
      cwd,
      directory: join(cwd, 'journal'),
      command: process.execPath,
      args: [fileURLToPath(new URL('./pi/fixtures/rpc-child.mjs', import.meta.url))],
    });
    await withEnvironment({
      PI_BROKER_SOCKET: broker.connection.socketPath,
      PI_AGENT_ID: broker.connection.agentId,
      PI_AGENT_TOKEN: broker.connection.token,
      PI_AGENT_ROLE: 'root',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      await pi.emit('session_start', { type: 'session_start', reason: 'startup' });

      const read = await pi.tools.get('read').execute('read-1', { path: 'code.txt' });
      assert.deepEqual(JSON.parse(read.content[0].text), read.details);
      assert.equal(read.details.text, 'source');

      const write = await pi.tools.get('write').execute('write-1', {
        path: 'code.txt', text: 'edited', expectedHash: read.details.hash,
      });
      assert.equal(write.details.path, join(cwd, 'code.txt'));
      assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'edited');

      const delegated = await pi.tools.get('delegate').execute('delegate-1', {
        tasks: [{ role: 'astra', task: 'Reply OK.', paths: ['code.txt'] }],
      });
      assert.match(delegated.content[0].text, /gpt-6-astra|OK/);

      await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
      await pi.emit('session_start', { type: 'session_start', reason: 'resume' });
      const reopened = await pi.tools.get('read').execute('read-2', { path: 'code.txt' });
      assert.equal(reopened.details.text, 'edited');
      await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
      await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
      await assert.rejects(
        pi.tools.get('read').execute('read-3', { path: 'code.txt' }),
        /Managed broker is not connected|IPC connection is closed/,
      );
    });
  } finally {
    await loaded.cleanup();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('checks broker permission before provider requests and injects the role prompt', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const cwd = await mkdtemp(join(tmpdir(), 'pi-extension-hooks-'));
  let broker;
  const loaded = await loadExtension();
  try {
    broker = await startBroker({
      cwd,
      directory: join(cwd, 'journal'),
      command: process.execPath,
      args: [fileURLToPath(new URL('./pi/fixtures/rpc-child.mjs', import.meta.url))],
    });
    await withEnvironment({
      PI_BROKER_SOCKET: broker.connection.socketPath,
      PI_AGENT_ID: broker.connection.agentId,
      PI_AGENT_TOKEN: broker.connection.token,
      PI_AGENT_ROLE: 'root',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      await pi.emit('session_start', { type: 'session_start', reason: 'startup' });
      await pi.emit('before_provider_request', { payload: {
        model: 'gpt-5.6-sol', reasoning: { effort: 'medium' },
      } }, {
        model: { provider: 'openai-codex', id: 'gpt-5.6-sol' },
        thinkingLevel: 'medium',
      });
      const prompt = await pi.emit('before_agent_start', { systemPrompt: 'base' });
      assert.match(prompt.systemPrompt, /Sol/);
      assert.match(prompt.systemPrompt, /exactly one task to Astra/);
      assert.match(prompt.systemPrompt, /edit/);
      await assert.rejects(
        pi.tools.get('escalate').execute('root-escalate', { reason: 'root cannot escalate' }),
        /Only delegated Sol can escalate/,
      );
      await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
    });
  } finally {
    await loaded.cleanup();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('uses the loaded edit tool for unique compare-and-swap replacements', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const cwd = await mkdtemp(join(tmpdir(), 'pi-extension-edit-'));
  let broker;
  const loaded = await loadExtension();
  try {
    const target = join(cwd, 'code.txt');
    const originalText = 'prefix\nneedle\nsuffix\n';
    await writeFile(target, originalText);
    broker = await startBroker({
      cwd,
      directory: join(cwd, 'journal'),
      command: process.execPath,
      args: [fileURLToPath(new URL('./pi/fixtures/rpc-child.mjs', import.meta.url))],
    });
    await withEnvironment({
      PI_BROKER_SOCKET: broker.connection.socketPath,
      PI_AGENT_ID: broker.connection.agentId,
      PI_AGENT_TOKEN: broker.connection.token,
      PI_AGENT_ROLE: 'root',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      await pi.emit('session_start', { type: 'session_start', reason: 'startup' });

      const original = await pi.tools.get('read').execute('read-edit', { path: 'code.txt' });
      const edit = await pi.tools.get('edit').execute('edit-1', {
        path: 'code.txt', oldText: 'needle', newText: 'replacement', expectedHash: JSON.parse(original.content[0].text).hash,
      });
      assert.deepEqual(JSON.parse(edit.content[0].text), edit.details);
      const editedText = 'prefix\nreplacement\nsuffix\n';
      assert.equal(await readFile(target, 'utf8'), editedText);
      assert.equal(typeof edit.details.hash, 'string');

      await assert.rejects(pi.tools.get('edit').execute('edit-stale', {
        path: 'code.txt', oldText: 'replacement', newText: 'stale', expectedHash: JSON.parse(original.content[0].text).hash,
      }), /preimage hash mismatch/);
      assert.equal(await readFile(target, 'utf8'), editedText);

      const ambiguousText = 'same\nsame\n';
      await writeFile(join(cwd, 'ambiguous.txt'), ambiguousText);
      const ambiguous = await pi.tools.get('read').execute('read-ambiguous', { path: 'ambiguous.txt' });
      await assert.rejects(pi.tools.get('edit').execute('edit-ambiguous', {
        path: 'ambiguous.txt', oldText: 'same', newText: 'changed', expectedHash: JSON.parse(ambiguous.content[0].text).hash,
      }), /unique oldText match/);
      assert.equal(await readFile(join(cwd, 'ambiguous.txt'), 'utf8'), ambiguousText);

      await assert.rejects(pi.tools.get('edit').execute('edit-missing-hash', {
        path: 'code.txt', oldText: 'replacement', newText: 'missing hash',
      }), /edit requires expectedHash/);
      await assert.rejects(pi.tools.get('edit').execute('edit-null-hash', {
        path: 'code.txt', oldText: 'replacement', newText: 'null hash', expectedHash: null,
      }), /edit requires expectedHash/);
      assert.equal(await readFile(target, 'utf8'), editedText);

      await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
    });
  } finally {
    await loaded.cleanup();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('rejects pre-aborted tool execution and returns a non-throwing bash denial', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const cwd = await mkdtemp(join(tmpdir(), 'pi-extension-cancel-'));
  let broker;
  const loaded = await loadExtension();
  try {
    broker = await startBroker({
      cwd,
      directory: join(cwd, 'journal'),
      command: process.execPath,
      args: [fileURLToPath(new URL('./pi/fixtures/rpc-child.mjs', import.meta.url))],
    });
    await withEnvironment({
      PI_BROKER_SOCKET: broker.connection.socketPath,
      PI_AGENT_ID: broker.connection.agentId,
      PI_AGENT_TOKEN: broker.connection.token,
      PI_AGENT_ROLE: 'root',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      await pi.emit('session_start', { type: 'session_start', reason: 'startup' });
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        pi.tools.get('read').execute('read-1', { path: 'code.txt' }, controller.signal),
        /cancel|abort/i,
      );
      assert.deepEqual(await pi.emit('user_bash', {
        type: 'user_bash', command: 'touch forbidden', excludeFromContext: false, cwd,
      }), {
        result: { output: 'Shell commands are unavailable; use managed tools.', exitCode: 1,
          cancelled: false, truncated: false },
      });
      await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
    });
  } finally {
    await loaded.cleanup();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('rejects an environment role that has no pinned model', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const loaded = await loadExtension();
  try {
    await withEnvironment({
      PI_BROKER_SOCKET: '/tmp/unopened.sock',
      PI_AGENT_ID: 'root',
      PI_AGENT_TOKEN: 'token',
      PI_AGENT_ROLE: 'unknown',
    }, async () => {
      assert.throws(() => loaded.factory(createPi()), /Unknown agent role/);
    });
  } finally {
    await loaded.cleanup();
  }
});

test('cancels a running delegated tool before returning its writable scope', async (t) => {
  requirePackageRoot(t);
  if (!loadExtension) return;

  const cwd = await mkdtemp(join(tmpdir(), 'pi-extension-running-cancel-'));
  const loaded = await loadExtension();
  let broker;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const directory = join(cwd, 'journal');
    broker = await startBroker({
      cwd, directory, command: process.execPath,
      args: [fileURLToPath(new URL('./pi/fixtures/rpc-child.mjs', import.meta.url))],
      env: { ...process.env, RPC_PROMPT_DELAY: '500', RPC_WRITE_AFTER_DELAY: 'code.txt' },
    });
    await withEnvironment({
      PI_BROKER_SOCKET: broker.connection.socketPath,
      PI_AGENT_ID: broker.connection.agentId,
      PI_AGENT_TOKEN: broker.connection.token,
      PI_AGENT_ROLE: 'root',
    }, async () => {
      const pi = createPi();
      loaded.factory(pi);
      await pi.emit('session_start', { type: 'session_start', reason: 'startup' });
      try {
        const controller = new AbortController();
        const outcome = pi.tools.get('delegate').execute('cancel-running', {
          tasks: [{ role: 'astra', task: 'Reply slowly', paths: ['code.txt'] }],
        }, controller.signal).then(result => ({ result }), error => ({ error }));
        const markerName = (await readdir(directory)).find(name => name.endsWith('.json'));
        let job;
        for (let attempt = 0; attempt < 200; attempt += 1) {
          const marker = JSON.parse(await readFile(join(directory, markerName), 'utf8'));
          job = Object.values(marker.jobs).find(item => item.role === 'astra' && item.state === 'running');
          if (job) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(job, 'delegated worker must be running before cancellation');
        controller.abort();
        const settled = await outcome;
        assert.match(settled.error?.message ?? '', /abort|cancel/i);
        assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
        const read = await pi.tools.get('read').execute('after-cancel', { path: 'code.txt' });
        assert.equal(read.details.text, 'source');
        await pi.tools.get('write').execute('resume-write', {
          path: 'code.txt', text: 'resumed', expectedHash: read.details.hash,
        });
        assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'resumed');
      } finally {
        await pi.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' });
      }
    });
  } finally {
    await broker?.close();
    await loaded.cleanup();
    await rm(cwd, { recursive: true, force: true });
  }
});
