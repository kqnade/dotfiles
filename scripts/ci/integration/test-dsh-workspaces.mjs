import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const modulePath = '../../../dot_config/deepseek-harness/work/workspaces.mjs';

assert.ok(process.env.DSH_TEST_WEB_PROFILE, 'DSH_TEST_WEB_PROFILE must point to an installed work Web profile');

test('installed Cordis routes registry access through the guard', async t => {
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

test('installed loader requires the guard before activating the Web server', async t => {
  const requireCli = createRequire(await realpath(join(process.env.DSH_TEST_WEB_PROFILE, 'node_modules/@deepseek-ai/dsh/package.json')));
  const { boot, loadOverlayPatches } = await import(pathToFileURL(requireCli.resolve('@deepseek-ai/dsh-app-boot')));
  const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-boot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, 'server.mjs');
  await writeFile(server, 'export const inject = ["testOriginalDependency"]; export function apply(ctx, config) { ctx.provide("testWebServing", { host: config.host, port: config.port, original: ctx.testOriginalDependency }); }');
  const config = join(root, 'cordis.yml');
  await writeFile(config, '[]');
  const requireProfile = createRequire(join(process.env.DSH_TEST_WEB_PROFILE, 'package.json'));
  const webPatchPath = join(dirname(requireProfile.resolve('@deepseek-ai/dsh-web-app')), '..', 'cordis.patch.yml');
  const webLayers = loadOverlayPatches('test', webPatchPath);
  const webserver = webLayers.flatMap(layer => layer.insert ?? []).find(entry => entry.id === 'webserver');
  assert.ok(webserver, 'installed Web bundle must declare its webserver');
  const webLayer = { insert: [{ ...webserver, name: pathToFileURL(server).href }] };
  const overlay = new URL('../../../dot_config/deepseek-harness/work/web-required.patch.yml', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const patches = loadOverlayPatches('test', fileURLToPath(overlay));
  const prepare = ctx => {
    ctx.provide('testOriginalDependency', true);
    ctx.plugin({ apply(provider) { provider.provide('webStartup', { host: '127.0.0.1', port: 3081 }); } });
  };
  const ctx = await boot('test', config, [webLayer, ...patches], prepare);
  assert.deepEqual(ctx.get('testWebServing'), { host: '127.0.0.1', port: 3081, original: true });
  await ctx.fiber.dispose();
  for (const broken of [
    patches.filter(patch => !patch.insert),
    [{ insert: [{ id: 'dotfiles-work-workspaces', name: pathToFileURL(join(root, 'missing.mjs')).href }] }, ...patches.filter(patch => !patch.insert)],
  ]) {
    await assert.rejects(boot('test', config, [webLayer, ...broken], prepare), /required.*plugin.*did not activate/i);
  }
  assert.throws(() => loadOverlayPatches('test', join(root, 'missing.patch.yml')), /failed to read overlay/i);
});
