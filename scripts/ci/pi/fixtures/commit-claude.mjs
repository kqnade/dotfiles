#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
let input = '';
for await (const chunk of process.stdin) input += chunk;

if (process.env.CLAUDE_TEST_ARGS) {
  await writeFile(process.env.CLAUDE_TEST_ARGS, JSON.stringify({ args, pid: process.pid }));
}
if (process.env.CLAUDE_TEST_INPUT) await writeFile(process.env.CLAUDE_TEST_INPUT, input);
if (process.env.CLAUDE_TEST_STARTED) await writeFile(process.env.CLAUDE_TEST_STARTED, 'started\n');
if (process.env.CLAUDE_TEST_STDERR) process.stderr.write(`${process.env.CLAUDE_TEST_STDERR}\n`);
if (process.env.CLAUDE_TEST_DESCENDANT) {
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  descendant.unref();
  if (process.env.CLAUDE_TEST_DESCENDANT_PID) {
    await writeFile(process.env.CLAUDE_TEST_DESCENDANT_PID, JSON.stringify({ pid: descendant.pid }));
  }
}
if (process.env.CLAUDE_TEST_HOLD) await new Promise(() => setInterval(() => {}, 1_000));

const output = process.env.CLAUDE_TEST_LARGE_OUTPUT
  ? `${'x'.repeat(70 * 1024)}✨ feat: add managed startup`
  : process.env.CLAUDE_TEST_OUTPUT ?? '✨ feat: add managed startup';
process.stdout.write(output);
if (process.env.CLAUDE_TEST_EXIT) process.exit(Number(process.env.CLAUDE_TEST_EXIT));
