import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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

test('installed Cordis routes registry access through the guard', {
  skip: !process.env.DSH_TEST_WEB_PROFILE,
}, async t => {
  const requireProfile = createRequire(join(process.env.DSH_TEST_WEB_PROFILE, 'package.json'));
  const requireBase = createRequire(requireProfile.resolve('@deepseek-ai/dsh-base'));
  const { Context } = await import(pathToFileURL(requireBase.resolve('@deepseek-ai/cordis')));
  const { apply } = await import(modulePath);
  const ctx = new Context();
  ctx.plugin({ apply });
  let mutated = false;
  ctx.provide('workspaceRegistry', {
    async create(path, title) { mutated = true; return { path, title }; },
    async initializeDefault() { throw new Error('default must not run'); },
    async resolveByPath() { return undefined; },
    list() { return []; },
    archivedSessionIds: [],
    pinnedSessionIds: [],
  });
  const child = await new Promise(resolve => {
    ctx.plugin({ inject: ['workspaceRegistry'], apply: consumer => resolve(consumer) });
  });
  await assert.rejects(child.workspaceRegistry.create(tmpdir()), /company repository/i);
  assert.equal(mutated, false);
  assert.equal(await child.workspaceRegistry.initializeDefault(), undefined);
  const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-cordis-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'remote.origin.url', 'git@github.com:jobtalk/example.git']);
  assert.deepEqual(await child.workspaceRegistry.create(root, 'Company'), { path: await realpath(root), title: 'Company' });
  assert.equal(mutated, true);

  const requireWeb = createRequire(requireProfile.resolve('@deepseek-ai/dsh-web-app'));
  const { WorkspaceController } = await import(pathToFileURL(requireWeb.resolve('@deepseek-ai/dsh-api-workspace-controller')));
  ctx.provide('typert', { resources: { register() {} } });
  ctx.provide('remoteAccess', {});
  ctx.plugin(WorkspaceController);
  const api = await new Promise(resolve => {
    ctx.plugin({ inject: ['workspaceController'], apply: consumer => resolve(consumer.workspaceController) });
  });
  mutated = false;
  await assert.rejects(api.create({ path: tmpdir() }), /company repository/i);
  assert.equal(mutated, false);
  assert.equal(await api.initializeDefault(new AbortController().signal), undefined);
});

test('installed loader requires the guard before activating the Web server', {
  skip: !process.env.DSH_TEST_WEB_PROFILE,
}, async t => {
  const requireCli = createRequire(await realpath(join(process.env.DSH_TEST_WEB_PROFILE, 'node_modules/@deepseek-ai/dsh/package.json')));
  const { boot, loadOverlayPatches } = await import(pathToFileURL(requireCli.resolve('@deepseek-ai/dsh-app-boot')));
  const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-boot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, 'server.mjs');
  await writeFile(server, 'export const inject = ["testOriginalDependency"]; export function apply(ctx) { ctx.provide("testWebServing", ctx.testOriginalDependency); }');
  const config = join(root, 'cordis.yml');
  await writeFile(config, JSON.stringify([{ id: 'webserver', name: pathToFileURL(server).href }]));
  const overlay = new URL('../../dot_config/deepseek-harness/work/web-required.patch.yml', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const patches = loadOverlayPatches('test', fileURLToPath(overlay));
  const prepare = ctx => ctx.provide('testOriginalDependency', true);
  const ctx = await boot('test', config, patches, prepare);
  assert.equal(ctx.get('testWebServing'), true);
  await ctx.fiber.dispose();
  for (const broken of [
    patches.filter(patch => !patch.insert),
    [{ insert: [{ id: 'dotfiles-work-workspaces', name: pathToFileURL(join(root, 'missing.mjs')).href }] }, ...patches.filter(patch => !patch.insert)],
  ]) {
    await assert.rejects(boot('test', config, broken, prepare), /required.*plugin.*did not activate/i);
  }
  assert.throws(() => loadOverlayPatches('test', join(root, 'missing.patch.yml')), /failed to read overlay/i);
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
