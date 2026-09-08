import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { generateClaudeCommitMessage, generatePiCommitMessage } from '../../pi/commit-backends.mjs';

const claudeFixturePath = fileURLToPath(new URL('./fixtures/commit-claude.mjs', import.meta.url));

const installClaudeFixture = async (root) => {
  const command = join(root, 'claude');
  const fixture = await readFile(claudeFixturePath, 'utf8');
  await writeFile(command, fixture.replace(/^#!.*\n/u, () => `#!${process.execPath}\n`));
  await chmod(command, 0o755);
  return command;
};

const installAuthorizationHook = async (home) => {
  const hook = join(home, '.claude', 'hooks', 'authorize-repository.sh');
  await mkdir(dirname(hook), { recursive: true });
  await writeFile(hook, [
    '#!/bin/sh',
    'set -eu',
    'if [ -n "${CLAUDE_TEST_GUARD_INPUT:-}" ]; then cat > "$CLAUDE_TEST_GUARD_INPUT"; else cat >/dev/null; fi',
    'if [ "${CLAUDE_TEST_GUARD_DENY:-}" = 1 ]; then',
    '  printf "repository denied\\n" >&2',
    '  exit 23',
    'fi',
  ].join('\n'));
  await chmod(hook, 0o755);
  return hook;
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const waitForJson = async (path) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      await setTimeout(10);
    }
  }
  throw new Error(`timed out waiting for valid JSON in ${path}`);
};

test('the Pi commit backend uses isolated no-tools Sol and validates its response', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-commit-backend-'));
  try {
    const result = await generatePiCommitMessage({
      cwd, piEntry: fileURLToPath(new URL('./fixtures/commit-pi.mjs', import.meta.url)),
      stagedDiff: '+specific staged content', recentLog: '📝 docs: describe setup',
    });
    assert.equal(result, '✨ feat: add managed startup');
    const observed = JSON.parse(await readFile(join(cwd, 'request.json'), 'utf8'));
    assert.equal(observed.model, 'gpt-5.6-sol');
    assert.equal(observed.effort, 'medium');
    assert.match(observed.prompt, /specific staged content/);
    assert.match(observed.prompt, /describe setup/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('cancelling commit generation stops the backend before returning', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-commit-cancel-'));
  const controller = new AbortController();
  const reason = new Error('Commit generation cancelled');
  try {
    const pending = generatePiCommitMessage({
      cwd, piEntry: fileURLToPath(new URL('./fixtures/commit-pi.mjs', import.meta.url)),
      stagedDiff: '+content', recentLog: '', signal: controller.signal,
      env: { ...process.env, PI_COMMIT_TEST_DELAY: '1' },
    });
    const rejected = assert.rejects(pending, error => error.errors?.includes(reason));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await readFile(join(cwd, 'request.json')); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await setTimeout(10);
    }
    controller.abort(reason);
    await rejected;
    const { pid } = JSON.parse(await readFile(join(cwd, 'request.json'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    controller.abort(reason);
    await rm(cwd, { recursive: true, force: true });
  }
});

test('the Claude commit backend authorizes first and uses no-tools stdin mode', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-backend-'));
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const argsPath = join(cwd, 'claude-args.json');
    const inputPath = join(cwd, 'claude-input.txt');
    const guardInputPath = join(cwd, 'guard-input.json');
    const stagedDiff = '$(touch should-not-run)\n+specific staged content';
    const recentLog = '📝 docs: describe setup';
    const result = await generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff,
      recentLog,
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_ARGS: argsPath,
        CLAUDE_TEST_INPUT: inputPath,
        CLAUDE_TEST_GUARD_INPUT: guardInputPath,
      },
    });

    assert.equal(result, '✨ feat: add managed startup');
    assert.deepEqual(await readJson(guardInputPath), { cwd });
    const observed = await readJson(argsPath);
    const args = observed.args;
    assert.deepEqual(args, [
      '--print', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--no-session-persistence', '--output-format', 'text',
    ]);
    assert.ok(!args.includes('--bare'));
    assert.ok(!args.includes('--safe-mode'));
    const input = await readFile(inputPath, 'utf8');
    assert.match(input, /specific staged content/u);
    assert.match(input, /describe setup/u);
    assert.doesNotMatch(args.join('\0'), /specific staged content/u);
    await assert.rejects(readFile(join(cwd, 'should-not-run')), { code: 'ENOENT' });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a denied Claude authorization hook prevents spawn and prompt transmission', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-denied-'));
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const argsPath = join(cwd, 'claude-args.json');
    const inputPath = join(cwd, 'claude-input.txt');
    const guardInputPath = join(cwd, 'guard-input.json');
    const pending = generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff: '+private staged content',
      recentLog: 'private recent history',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_ARGS: argsPath,
        CLAUDE_TEST_INPUT: inputPath,
        CLAUDE_TEST_GUARD_INPUT: guardInputPath,
        CLAUDE_TEST_GUARD_DENY: '1',
      },
    });
    const outcome = await pending.then(
      () => ({ ok: true }),
      error => ({ ok: false, error }),
    );

    assert.equal(outcome.ok, false);
    assert.ok(outcome.error.errors?.some(error => /repository denied/u.test(error.message)));
    assert.deepEqual(await readJson(guardInputPath), { cwd });
    await assert.rejects(readFile(argsPath), { code: 'ENOENT' });
    await assert.rejects(readFile(inputPath), { code: 'ENOENT' });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('Claude backend returns nonzero exit and stderr as a failure', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-failure-'));
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const outcome = await generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff: '+content',
      recentLog: '',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_GUARD_INPUT: join(cwd, 'guard-input.json'),
        CLAUDE_TEST_EXIT: '17',
        CLAUDE_TEST_STDERR: 'claude failed',
      },
    }).then(
      () => ({ ok: true }),
      error => ({ ok: false, error }),
    );

    assert.equal(outcome.ok, false);
    assert.ok(outcome.error.errors?.some(error => /claude failed/u.test(error.message)));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('Claude backend validates the generated commit message', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-invalid-'));
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const outcome = await generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff: '+content',
      recentLog: '',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_GUARD_INPUT: join(cwd, 'guard-input.json'),
        CLAUDE_TEST_OUTPUT: 'not a commit message',
      },
    }).then(
      () => ({ ok: true }),
      error => ({ ok: false, error }),
    );

    assert.equal(outcome.ok, false);
    assert.ok(outcome.error.errors?.some(error => /valid gitmoji conventional message/u.test(error.message)));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('Claude backend rejects stdout that exceeds its output limit', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-output-limit-'));
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const outcome = await generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff: '+content',
      recentLog: '',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_GUARD_INPUT: join(cwd, 'guard-input.json'),
        CLAUDE_TEST_LARGE_OUTPUT: '1',
      },
    }).then(
      () => ({ ok: true }),
      error => ({ ok: false, error }),
    );

    assert.equal(outcome.ok, false);
    assert.ok(outcome.error.errors?.some(error => error.code === 'OUTPUT_LIMIT'));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('Claude backend stops descendants before waiting for closed output pipes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-descendant-'));
  const descendantPath = join(cwd, 'descendant.json');
  let descendantPid;
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const pending = generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff: '+content',
      recentLog: '',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_GUARD_INPUT: join(cwd, 'guard-input.json'),
        CLAUDE_TEST_DESCENDANT: '1',
        CLAUDE_TEST_DESCENDANT_PID: descendantPath,
      },
    });
    await waitForJson(descendantPath);
    const result = await Promise.race([
      pending,
      setTimeout(2_000).then(() => { throw new Error('descendant cleanup timed out'); }),
    ]);

    assert.equal(result, '✨ feat: add managed startup');
    ({ pid: descendantPid } = await readJson(descendantPath));
    assert.throws(() => process.kill(descendantPid, 0), { code: 'ESRCH' });
  } finally {
    if (descendantPid === undefined) {
      try { ({ pid: descendantPid } = await readJson(descendantPath)); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (descendantPid !== undefined) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

test('cancelling Claude generation proves the process group stopped', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-commit-cancel-'));
  const controller = new AbortController();
  const reason = new Error('Claude generation cancelled');
  try {
    const home = join(cwd, 'home');
    await installAuthorizationHook(home);
    const claudeEntry = await installClaudeFixture(cwd);
    const argsPath = join(cwd, 'claude-args.json');
    const pending = generateClaudeCommitMessage({
      cwd,
      claudeEntry,
      stagedDiff: '+content',
      recentLog: '',
      signal: controller.signal,
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_TEST_ARGS: argsPath,
        CLAUDE_TEST_GUARD_INPUT: join(cwd, 'guard-input.json'),
        CLAUDE_TEST_HOLD: '1',
      },
    });
    const argsMarker = await waitForJson(argsPath);
    controller.abort(reason);
    const outcome = await pending.then(
      () => ({ ok: true }),
      error => ({ ok: false, error }),
    );

    assert.equal(outcome.ok, false);
    assert.ok(outcome.error.errors?.includes(reason));
    assert.throws(() => process.kill(argsMarker.pid, 0), { code: 'ESRCH' });
  } finally {
    controller.abort(reason);
    await rm(cwd, { recursive: true, force: true });
  }
});
