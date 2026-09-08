import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { commitStagedChanges } from '../../pi/git-cc.mjs';

const fixture = ({ remote = 'git@github.com:kqnade/example.git', diff = 'staged changes' } = {}) => {
  const calls = [];
  return {
    calls,
    runGit: async args => {
      calls.push(args);
      if (args[0] === 'config') return `${remote}\n`;
      if (args[0] === 'diff') return diff;
      if (args[0] === 'log') return 'previous commit';
      if (args[0] === 'commit') return 'committed\n';
      throw new Error(`Unexpected Git call: ${JSON.stringify(args)}`);
    },
  };
};

test('git cc rejects an unsupported remote before reading staged files or history', async () => {
  const git = fixture({ remote: 'https://unsupported.example/owner/repo' });
  await assert.rejects(commitStagedChanges({ ...git, generate: () => assert.fail('must not generate') }), /invalid or unsupported GitHub remote/);
  assert.deepEqual(git.calls, [['config', '--get', 'remote.origin.url']]);
});

test('git cc routes validated namespaces and commits only validated output', async () => {
  for (const [owner, backend] of [['kqnade', 'pi'], ['livesense-inc', 'claude'], ['jobtalk', 'claude']]) {
    const git = fixture({ remote: `git@github.com:${owner}/example.git` });
    const result = await commitStagedChanges({
      ...git,
      generate: async ({ route, stagedDiff, recentLog }) => {
        assert.equal(route.backend, backend);
        assert.equal(stagedDiff, 'staged changes');
        assert.equal(recentLog, 'previous commit');
        return '✨ feat: add managed startup';
      },
    });
    assert.deepEqual(git.calls.at(-1), ['commit', '-m', '✨ feat: add managed startup']);
    assert.equal(result.output, 'committed\n');
  }
});

test('git cc preserves staged work when generation fails or produces invalid output', async () => {
  for (const generate of [async () => { throw new Error('provider unavailable'); }, async () => 'invalid message']) {
    const git = fixture();
    await assert.rejects(commitStagedChanges({ ...git, generate }));
    assert.equal(git.calls.some(args => args[0] === 'commit'), false);
  }
});

test('git cc rejects empty staged changes without invoking a backend', async () => {
  const git = fixture({ diff: '' });
  await assert.rejects(commitStagedChanges({ ...git, generate: () => assert.fail('must not generate') }), /No staged changes/);
});

test('git cc refuses to commit staging or remote changes made during generation', async () => {
  for (const changed of ['diff', 'config']) {
    const git = fixture();
    let generated = false;
    const runGit = args => generated && args[0] === changed ? 'changed' : git.runGit(args);
    await assert.rejects(commitStagedChanges({
      runGit,
      generate: async () => { generated = true; return '✨ feat: add managed startup'; },
    }), /changed during message generation/);
    assert.equal(git.calls.some(args => args[0] === 'commit'), false);
  }
});

test('git cc and git ccc invoke the managed entry and preserve failure status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-git-cc-wrapper-'));
  try {
    const bin = join(root, 'bin');
    const checkout = join(root, 'checkout');
    const entry = join(checkout, 'scripts', 'pi', 'git-cc.mjs');
    const recorded = join(root, 'args.json');
    await mkdir(bin, { recursive: true });
    await mkdir(dirname(entry), { recursive: true });
    await writeFile(entry, "import { writeFile } from 'node:fs/promises';\nawait writeFile(process.env.PI_TEST_ARGS, JSON.stringify(process.argv.slice(2)));\nprocess.exit(7);\n");
    const mise = join(bin, 'mise');
    await writeFile(mise, '#!/bin/sh\n[ "$1" = exec ] && [ "$2" = -- ] || exit 91\nshift 2\nexec "$@"\n');
    await chmod(mise, 0o755);
    for (const name of ['git-cc', 'git-ccc']) {
      await assert.rejects(promisify(execFile)('zsh', ['-f', '-c', 'source "$1"; "$2" "$3"', 'zsh',
        resolve('dot_config/zsh/functions/cc.zsh'), name, 'literal argument'], {
        cwd: root,
        env: { ...process.env, DOTFILES_ROOT: checkout, PI_TEST_ARGS: recorded,
          PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}` },
      }), error => {
        assert.equal(error.code, 7, error.stderr);
        return true;
      });
      assert.deepEqual(JSON.parse(await readFile(recorded, 'utf8')), ['literal argument']);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the Git entry creates a local commit through the pinned no-tools Pi backend', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-git-cc-integration-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    PI_PACKAGE_TARGET: join(root, 'packages') };
  const execute = promisify(execFile);
  const git = args => execute('git', args, { cwd: root, env });
  try {
    const packageDirectory = join(env.PI_PACKAGE_TARGET, 'node_modules', '@earendil-works', 'pi-coding-agent');
    const piEntry = join(packageDirectory, 'dist', 'bundle', 'cli.js');
    await mkdir(dirname(piEntry), { recursive: true });
    await copyFile(resolve('scripts/ci/pi/fixtures/commit-pi.mjs'), piEntry);
    await writeFile(join(packageDirectory, 'package.json'), '{"type":"module","version":"0.85.1"}\n');
    await git(['init', '-q']);
    await git(['config', 'user.name', 'Fixture']);
    await git(['config', 'user.email', 'fixture@example.invalid']);
    await git(['config', 'commit.gpgSign', 'false']);
    await git(['remote', 'add', 'origin', 'git@github.com:kqnade/fixture.git']);
    await writeFile(join(root, 'code.txt'), 'initial\n');
    await git(['add', 'code.txt']);
    await git(['commit', '-qm', 'initial']);
    await writeFile(join(root, 'code.txt'), 'managed startup\n');
    await git(['add', 'code.txt']);
    await writeFile(join(root, 'unstaged.txt'), 'preserved\n');
    const result = await execute(process.execPath, [resolve('scripts/pi/git-cc.mjs')], { cwd: root, env });
    assert.match(result.stdout, /Message: ✨ feat: add managed startup/u);
    assert.equal((await git(['log', '-1', '--format=%s'])).stdout.trim(), '✨ feat: add managed startup');
    assert.equal((await git(['show', 'HEAD:code.txt'])).stdout, 'managed startup\n');
    assert.equal(await readFile(join(root, 'unstaged.txt'), 'utf8'), 'preserved\n');
    assert.equal((await git(['ls-tree', '--name-only', 'HEAD'])).stdout, 'code.txt\n');
    const request = JSON.parse(await readFile(join(root, 'request.json'), 'utf8'));
    assert.equal(request.model, 'gpt-5.6-sol');
    assert.equal(request.effort, 'medium');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
