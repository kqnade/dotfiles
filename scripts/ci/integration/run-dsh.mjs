#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.ok(process.argv.slice(2).every(arg => arg === '--work'), 'Usage: node run-dsh.mjs [--work]');
const run = (test, args = [], env = process.env) => execFileSync(process.execPath,
  [fileURLToPath(new URL(test, import.meta.url)), ...args], { stdio: 'inherit', env });
const profile = role => join(homedir(), '.dsh', role, 'profiles', 'tui');
const personal = createRequire(join(profile('personal'), 'package.json'));
run('./test-dsh-auto-review.mjs', [personal.resolve('@deepseek-ai/dsh-experimental-auto-review')]);
for (const role of process.argv.includes('--work') ? ['personal', 'work'] : ['personal']) {
  const lib = join(profile(role), 'node_modules', '@deepseek-ai/dsh', 'lib');
  const modules = readdirSync(lib).filter(name => /^profile-boot-.*[.]js$/.test(name));
  assert.equal(modules.length, 1, 'installed CLI must contain one profile-boot module');
  run('./test-dsh-shutdown.mjs', [join(lib, modules[0])]);
}
if (process.argv.includes('--work')) {
  const env = { ...process.env, DSH_TEST_WORK_HOME: join(homedir(), '.dsh/work'),
    DSH_TEST_WEB_PROFILE: join(homedir(), '.dsh/work/profiles/web') };
  run('./test-dsh-claude-sdk.mjs', [], env);
  run('./test-dsh-workspaces.mjs', [], env);
  execFileSync('python3', ['-B', fileURLToPath(new URL('./test-dsh-cli.py', import.meta.url))], {
    stdio: 'inherit', env: { ...env, DSH_TEST_CLI: join(env.DSH_TEST_WEB_PROFILE, 'node_modules/.bin/dsh') },
  });
}
