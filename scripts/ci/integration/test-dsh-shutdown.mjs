#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('Usage: node scripts/ci/integration/test-dsh-shutdown.mjs <profile-boot module>');
const source = readFileSync(modulePath, 'utf8');
const start = source.indexOf('function createProcessShutdown(');
const end = source.indexOf('\n//#endregion', start);
assert.ok(start >= 0 && end > start, 'shutdown controller must exist in the pinned DSH build');
const controller = source.slice(start, end);

function run(body, code = 0) {
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    input: `${controller}\n${body}`,
    encoding: 'utf8',
    timeout: 1500,
    killSignal: 'SIGKILL',
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, code, result.stderr);
  return result.stdout;
}

test('completed disposal exits within the deadline despite a referenced timer', () => {
  const output = run(`
    setInterval(() => {}, 1000);
    const shutdown = createProcessShutdown(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      console.log('disposed');
    }, undefined, undefined, 100);
    await shutdown.shutdown(17);
  `, 17);
  assert.equal(output.trim(), 'disposed');
});

test('quiescent disposal does not wait for the exit deadline', () => {
  run(`await createProcessShutdown(async () => {}, undefined, undefined, 5000).shutdown(0);`);
});

test('unfinished disposal is bounded by the exit deadline', () => {
  run(`createProcessShutdown(() => new Promise(() => {}), undefined, undefined, 100).shutdown(17);`, 17);
});

test('failed disposal preserves the requested exit code', () => {
  run(`await createProcessShutdown(async () => { throw new Error('cleanup failed'); }, undefined, undefined, 100).shutdown(17);`, 17);
});

test('an interrupt after disposal escalates without waiting for the deadline', () => {
  run(`
    setInterval(() => {}, 1000);
    const shutdown = createProcessShutdown(async () => {}, undefined, undefined, 5000);
    await shutdown.shutdown(0);
    shutdown.interrupt(130);
  `, 130);
});
