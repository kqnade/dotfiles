import { appendFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
if (process.env.PI_AGENT_ROLE !== 'root') process.exit(0);

const logPath = process.env.PI_TEST_LOG;
if (logPath) {
  await appendFile(logPath, `${JSON.stringify({ args, packageRoot: process.env.PI_PACKAGE_ROOT })}\n`);
}

if (process.env.PI_TEST_READY) await writeFile(process.env.PI_TEST_READY, 'ready\n');
if (process.env.PI_TEST_STDERR) process.stderr.write(`${process.env.PI_TEST_STDERR}\n`);
if (process.env.PI_TEST_HOLD) {
  await new Promise(() => setInterval(() => {}, 1_000));
}

process.stdout.write(process.env.PI_TEST_OUTPUT ?? 'PI_ROOT_READY\n');
process.exit(Number(process.env.PI_TEST_EXIT ?? 0));
