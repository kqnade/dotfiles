import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const modulePath = '../../dot_config/deepseek-harness/work/workspaces.mjs';

test('plugin guards registration before mutation and disables automatic default folders', async () => {
  const { apply } = await import(modulePath);
  let intercept;
  const ctx = { on(name, listener) {
    assert.equal(name, 'internal/get');
    intercept = listener;
  }, provide(name, value) {
    assert.equal(name, 'dotfilesWorkWorkspacePolicy');
    assert.equal(value, true);
    assert.equal(typeof intercept, 'function');
  } };
  apply(ctx);
  const calls = [];
  const registry = {
    async create(path) { calls.push(path); },
    async initializeDefault(resolveDirectory) { calls.push(await resolveDirectory()); },
    list() { return ['existing']; },
  };
  const guarded = intercept(ctx, 'workspaceRegistry', new Error(), () => registry);
  await assert.rejects(guarded.create(tmpdir()), /company repository/i);
  assert.equal(await guarded.initializeDefault(() => { throw new Error('must not resolve'); }), undefined);
  assert.deepEqual(calls, []);
  assert.deepEqual(guarded.list(), ['existing']);
  assert.equal(intercept(ctx, 'otherService', new Error(), () => registry), registry);
});

test('work workspace authorization checks canonical directories and all resolved origins', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workspaces-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_CONFIG_COUNT']) delete env[key];
  const git = (...args) => execFileSync('git', args, { env });
  const { authorizeWorkspace } = await import(modulePath);
  const repo = join(root, 'repo');
  git('init', '-q', repo);
  const origin = url => git('-C', repo, 'config', '--replace-all', 'remote.origin.url', url);
  await assert.rejects(authorizeWorkspace(repo, env), /company repository/i);
  await assert.rejects(authorizeWorkspace(root, env), /company repository/i);
  await assert.rejects(authorizeWorkspace('relative', env), /absolute/i);
  await assert.rejects(authorizeWorkspace(join(root, 'missing'), env));
  const file = join(root, 'file');
  await writeFile(file, 'not a directory');
  await assert.rejects(authorizeWorkspace(file, env), /directory/i);
  for (const url of [
    'git@github.com:livesense-inc/example.git',
    'https://github.com/jobtalk/example.git',
    'ssh://git@github.com:22/Jobtalk/example.git/',
  ]) {
    origin(url);
    assert.equal(await authorizeWorkspace(repo, env), await realpath(repo));
  }
  for (const url of [
    'https://github.com/kqnade/example.git',
    'https://github.com.evil/jobtalk/example.git',
    'https://github.com/jobtalk-extra/example.git',
    'file:///jobtalk/example.git',
  ]) {
    origin(url);
    await assert.rejects(authorizeWorkspace(repo, env), /company repository/i);
  }
  origin('git@github.com:jobtalk/example.git');
  git('-C', repo, 'config', '--add', 'remote.origin.url', 'git@github.com:kqnade/other.git');
  await assert.rejects(authorizeWorkspace(repo, env), /company repository/i);
  origin('company:example.git');
  git('-C', repo, 'config', 'url.git@github.com:jobtalk/.insteadOf', 'company:');
  await authorizeWorkspace(repo, env);
  const subdir = join(repo, 'subdir');
  await mkdir(subdir);
  await authorizeWorkspace(subdir, env);
  const alias = join(root, 'alias');
  await symlink(repo, alias);
  await authorizeWorkspace(alias, env);
  await assert.rejects(authorizeWorkspace(root, { ...env, GIT_DIR: join(repo, '.git'), GIT_WORK_TREE: repo }), /company repository/i);
  await assert.rejects(authorizeWorkspace(repo, { ...env, PATH: root }), /company repository/i);
  origin('git@github.com:kqnade/example.git');
  await assert.rejects(authorizeWorkspace(alias, env), /company repository/i);
});
