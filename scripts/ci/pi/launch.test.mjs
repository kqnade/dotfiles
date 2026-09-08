import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { launch } from '../../../dot_pi/agent/runtime/launch.mjs';

test('the launcher journals a managed root and closes the broker after root exit', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-launch-'));
  const directory = join(cwd, 'journal');
  const fixture = fileURLToPath(new URL('./fixtures/interactive-root.mjs', import.meta.url));
  try {
    const result = await launch({
      cwd, directory, piEntry: fixture, extensionPath: fixture,
      env: { ...process.env, PI_TEST_JOURNAL: directory }, capture: true,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, 'ROOT_READY\n');
    assert.equal(await readFile(join(cwd, 'created.txt'), 'utf8'), 'root wrote through broker');
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('cancelling a running root confirms its stop and removes its journal', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-launch-cancel-'));
  const directory = join(cwd, 'journal');
  const fixture = fileURLToPath(new URL('./fixtures/interactive-root.mjs', import.meta.url));
  const controller = new AbortController();
  try {
    const running = launch({
      cwd, directory, piEntry: fixture, extensionPath: fixture, capture: true,
      env: { ...process.env, PI_TEST_JOURNAL: directory, PI_TEST_KEEP_RUNNING: '1' },
      signal: controller.signal,
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await readFile(join(cwd, 'created.txt')); ready = true; break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await setTimeout(10);
    }
    controller.abort();
    const result = await running;
    assert.ok(ready, result.stderr);
    assert.equal(result.signal, 'SIGTERM');
    assert.deepEqual(await readdir(directory), []);
  } finally {
    controller.abort();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('print prompts are passed literally without overriding the root policy', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-launch-print-'));
  const fixture = fileURLToPath(new URL('./fixtures/interactive-root.mjs', import.meta.url));
  try {
    const result = await launch({
      cwd, directory: join(cwd, 'journal'), piEntry: fixture, extensionPath: fixture,
      env: { ...process.env, PI_TEST_PROMPT: '--model untrusted' },
      prompt: '--model untrusted', capture: true,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, 'PROMPT_READY\n');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('the root receives session options while keeping its pinned model', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-launch-session-'));
  const directory = join(cwd, 'journal');
  const fixture = fileURLToPath(new URL('./fixtures/interactive-root.mjs', import.meta.url));
  const rootArgs = ['--session-id', 'selected-session'];
  try {
    const result = await launch({
      cwd, directory, piEntry: fixture, extensionPath: fixture, capture: true, rootArgs,
      env: { ...process.env, PI_TEST_JOURNAL: directory, PI_TEST_ROOT_ARGS: JSON.stringify(rootArgs) },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, 'ROOT_READY\n');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
