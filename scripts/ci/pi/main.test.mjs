import assert from 'node:assert/strict';
import { access, chmod, copyFile, mkdir, mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  buildLaunchOptions,
  formatError,
  main,
  packageTarget,
  parseArguments,
  resolveExtensionPath,
  resolveJournalDirectory,
  resolvePiEntry,
} from '../../../dot_pi/agent/runtime/main.mjs';
import { createManagedSkills, RETAINED_SKILL_NAMES } from './fixtures/managed-skills.mjs';

const spawnCaptured = (command, args, options = {}) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const result = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, result };
};

const run = (command, args, options = {}) => spawnCaptured(command, args, options).result;

const waitForPath = async (path) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await access(path);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
};

const mainPath = fileURLToPath(new URL('../../../dot_pi/agent/runtime/main.mjs', import.meta.url));
const piFixturePath = fileURLToPath(new URL('./fixtures/managed-pi.mjs', import.meta.url));

const createPiInstall = async (root) => {
  const packageTarget = join(root, 'packages');
  const packageDirectory = join(packageTarget, 'node_modules', '@earendil-works', 'pi-coding-agent');
  const entry = join(packageDirectory, 'dist', 'bundle', 'cli.js');
  await mkdir(dirname(entry), { recursive: true });
  await copyFile(piFixturePath, entry);
  await writeFile(join(packageDirectory, 'package.json'), '{"type":"module","version":"0.85.1"}\n');
  await createManagedSkills(join(root, 'home', '.agents', 'skills'));
  return packageTarget;
};

test('managed CLI accepts help without requiring a package install', () => {
  assert.deepEqual(parseArguments(['--help']), { help: true, launchArgs: [] });
});

test('managed CLI reports nested launch failure details and a nonzero result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-error-'));
  const previousWrite = process.stderr.write;
  const previousExitCode = process.exitCode;
  let stderr = '';
  try {
    const packageTarget = await createPiInstall(root);
    process.stderr.write = (chunk) => {
      stderr += String(chunk);
      return true;
    };
    const result = await main([], {
      cwd: root,
      env: { ...process.env, PI_PACKAGE_TARGET: packageTarget },
      runLaunch: async () => {
        throw new AggregateError([new Error('journal refusal')], 'Pi launch failed');
      },
    });
    assert.equal(result.code, 1);
    assert.equal(formatError(new AggregateError([new Error('journal refusal')], 'Pi launch failed')), 'Pi launch failed: journal refusal');
    assert.match(stderr, /Pi launch failed: journal refusal/u);
  } finally {
    process.stderr.write = previousWrite;
    process.exitCode = previousExitCode;
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI prints help before package lookup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-help-'));
  try {
    const result = await run(process.execPath, [mainPath, '--help'], {
      cwd: root,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        PI_PACKAGE_TARGET: join(root, 'missing-packages'),
      },
    });
    assert.equal(result.code, 0, JSON.stringify(result));
    assert.match(result.stdout, /Usage: pi/u);
    assert.equal(result.stderr, '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI forwards only session and history options', () => {
  assert.deepEqual(parseArguments([
    '-c', '--resume', '--session', 'session.json', '--session-id', 'session-id',
    '--session-dir', '/tmp/sessions', '--fork=other.json', '-n', 'managed',
  ]), {
    launchArgs: [
      '--continue', '--resume', '--session', 'session.json', '--session-id', 'session-id',
      '--session-dir', '/tmp/sessions', '--fork', 'other.json', '--name', 'managed',
    ],
  });
});

test('managed CLI refuses model, provider, tool, and extension overrides', () => {
  for (const args of [
    ['--model', 'untrusted/model'],
    ['--provider', 'untrusted'],
    ['--tools', 'bash'],
    ['--extension', '/tmp/untrusted.ts'],
    ['-p', '--model', 'untrusted/model'],
    ['--tui-mode', 'regular'],
    ['-a'],
  ]) {
    assert.throws(() => parseArguments(args), /managed and cannot be overridden/u);
  }
});

test('managed CLI derives external package, extension, and journal paths', () => {
  const env = {
    HOME: '/home/tester',
    XDG_CACHE_HOME: '/var/cache/tester',
    XDG_STATE_HOME: '/var/state/tester',
  };
  const parsed = parseArguments(['--session-id', 'stable']);
  const options = buildLaunchOptions({ env, cwd: '/work/project', parsed });

  assert.equal(packageTarget(env), '/var/cache/tester/pi/agent/packages');
  assert.equal(resolvePiEntry(env), '/var/cache/tester/pi/agent/packages/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
  assert.equal(resolveJournalDirectory(env), '/var/state/tester/pi/sessions');
  assert.equal(options.extensionPath, resolveExtensionPath());
  assert.deepEqual(options.additionalExtensions, [
    fileURLToPath(new URL('../../../dot_pi/agent/extensions/lsp.ts', import.meta.url)),
  ]);
  assert.equal(options.cwd, '/work/project');
  assert.equal(options.env.PI_PACKAGE_ROOT, '/var/cache/tester/pi/agent/packages');
  assert.deepEqual(options.rootArgs, ['--session-id', 'stable']);
  assert.equal(options.prompt, undefined);
});

test('managed CLI keeps an empty invocation interactive and preserves prompt text', () => {
  assert.deepEqual(parseArguments([]), { launchArgs: [] });
  assert.deepEqual(parseArguments(['List', 'the', 'files']), {
    launchArgs: ['--', 'List', 'the', 'files'],
  });
  assert.deepEqual(parseArguments(['--', '-model-looking prompt']), {
    launchArgs: ['--', '-model-looking prompt'],
  });
  assert.deepEqual(parseArguments(['-p', '--model untrusted']), {
    launchArgs: [],
    prompt: '--model untrusted',
  });
  assert.deepEqual(parseArguments(['-p', '--', '--model untrusted']), {
    launchArgs: [],
    prompt: '--model untrusted',
  });
});

test('pi executable delegates through mise and preserves arguments and exit status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-entry-'));
  try {
    const home = join(root, 'home');
    const bin = join(root, 'bin');
    await mkdir(join(home, '.pi', 'agent', 'runtime'), { recursive: true });
    await mkdir(bin, { recursive: true });
    await writeFile(join(home, '.pi', 'agent', 'runtime', 'main.mjs'), [
      "import { writeFile } from 'node:fs/promises';",
      "await writeFile(process.env.PI_TEST_ARGS, JSON.stringify(process.argv.slice(2)));",
      'process.exit(Number(process.env.PI_TEST_EXIT));',
    ].join('\n'));
    await writeFile(join(bin, 'mise'), [
      '#!/bin/sh',
      '[ "$1" = exec ] && [ "$2" = -- ] || exit 91',
      'shift 2',
      'exec "$@"',
    ].join('\n'));
    await chmod(join(bin, 'mise'), 0o755);

    const argsPath = join(root, 'args.json');
    const result = await run(join(process.cwd(), 'dot_local/bin/executable_pi'), ['--session-id', 'abc', '--', 'literal'], {
      env: {
        ...process.env,
        HOME: home,
        PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`,
        PI_TEST_ARGS: argsPath,
        PI_TEST_EXIT: '7',
      },
    });

    assert.equal(result.code, 7, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(argsPath, 'utf8')), ['--session-id', 'abc', '--', 'literal']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI refuses a stale installed Pi package version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-stale-'));
  try {
    const packageTarget = await createPiInstall(root);
    const manifest = join(
      packageTarget,
      'node_modules',
      '@earendil-works',
      'pi-coding-agent',
      'package.json',
    );
    await writeFile(manifest, '{"type":"module","version":"0.85.0"}\n');
    const result = await run(process.execPath, [mainPath], {
      cwd: root,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        PI_PACKAGE_TARGET: packageTarget,
      },
    });

    assert.equal(result.code, 1, JSON.stringify(result));
    assert.match(result.stderr, /unsupported Pi package version 0\.85\.0; expected 0\.85\.1/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI starts an interactive root from the external package target', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-main-interactive-')));
  try {
    const packageTarget = await createPiInstall(root);
    const logPath = join(root, 'root.log');
    const home = join(root, 'home');
    const result = await run(process.execPath, [mainPath], {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        XDG_STATE_HOME: join(root, 'state'),
        PI_PACKAGE_TARGET: packageTarget,
        PI_TEST_LOG: logPath,
      },
    });

    assert.equal(result.code, 0, JSON.stringify(result));
    assert.equal(result.stdout, 'PI_ROOT_READY\n');
    const invocation = JSON.parse((await readFile(logPath, 'utf8')).trim());
    assert.equal(invocation.packageRoot, packageTarget);
    assert.ok(invocation.args.includes('--no-builtin-tools'));
    assert.ok(invocation.args.includes('--no-extensions'));
    assert.ok(invocation.args.includes('--no-skills'));
    assert.deepEqual(
      invocation.args.flatMap((arg, index) => arg === '--skill' ? [invocation.args[index + 1]] : []),
      RETAINED_SKILL_NAMES.map(name => join(home, '.agents', 'skills', name, 'SKILL.md')),
    );
    assert.ok(invocation.args.includes('-e'));
    assert.ok(!invocation.args.includes('--print'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI forwards a literal print prompt after fixed root flags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-print-'));
  try {
    const packageTarget = await createPiInstall(root);
    const logPath = join(root, 'root.log');
    const result = await run(process.execPath, [mainPath, '-p', 'summarize this'], {
      cwd: root,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        XDG_STATE_HOME: join(root, 'state'),
        PI_PACKAGE_TARGET: packageTarget,
        PI_TEST_LOG: logPath,
      },
    });

    assert.equal(result.code, 0, JSON.stringify(result));
    const invocation = JSON.parse((await readFile(logPath, 'utf8')).trim());
    const printIndex = invocation.args.indexOf('--print');
    assert.ok(printIndex > -1);
    assert.deepEqual(invocation.args.slice(printIndex, printIndex + 3), ['--print', '--', 'summarize this']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI keeps a positional prompt in interactive mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-positional-'));
  try {
    const packageTarget = await createPiInstall(root);
    const logPath = join(root, 'root.log');
    const result = await run(process.execPath, [mainPath, 'inspect this project'], {
      cwd: root,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        XDG_STATE_HOME: join(root, 'state'),
        PI_PACKAGE_TARGET: packageTarget,
        PI_TEST_LOG: logPath,
      },
    });

    assert.equal(result.code, 0, JSON.stringify(result));
    const invocation = JSON.parse((await readFile(logPath, 'utf8')).trim());
    assert.deepEqual(invocation.args.slice(-2), ['--', 'inspect this project']);
    assert.ok(!invocation.args.includes('--print'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI preserves root stderr and nonzero exit status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-failure-'));
  try {
    const packageTarget = await createPiInstall(root);
    const result = await run(process.execPath, [mainPath], {
      cwd: root,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        XDG_STATE_HOME: join(root, 'state'),
        PI_PACKAGE_TARGET: packageTarget,
        PI_TEST_EXIT: '17',
        PI_TEST_STDERR: 'root failed',
      },
    });

    assert.equal(result.code, 17, JSON.stringify(result));
    assert.match(result.stderr, /root failed/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('managed CLI converts SIGTERM into an abort and signal exit status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-main-signal-'));
  let processHandle;
  try {
    const packageTarget = await createPiInstall(root);
    const readyPath = join(root, 'ready');
    let completion;
    ({ child: processHandle, result: completion } = spawnCaptured(process.execPath, [mainPath], {
      cwd: root,
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        XDG_STATE_HOME: join(root, 'state'),
        PI_PACKAGE_TARGET: packageTarget,
        PI_TEST_HOLD: '1',
        PI_TEST_READY: readyPath,
      },
    }));
    await waitForPath(readyPath);
    processHandle.kill('SIGTERM');
    const result = await completion;
    assert.equal(result.code, 143, JSON.stringify(result));
    assert.equal(result.signal, null);
  } finally {
    if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
      processHandle.kill('SIGKILL');
    }
    await rm(root, { recursive: true, force: true });
  }
});
