import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect } from '../../../../dot_pi/agent/runtime/ipc.mjs';

const args = process.argv.slice(2);
if (args[args.indexOf('--model') + 1] !== 'gpt-5.6-sol') throw new Error('wrong root model');
if (args[args.indexOf('--thinking') + 1] !== 'medium') throw new Error('wrong root effort');
if (!args.includes('--no-builtin-tools') || !args.includes('--no-extensions')) throw new Error('unmanaged tools enabled');
if (process.env.PI_TEST_PROMPT) {
  if (!args.includes('--print') || args.at(-2) !== '--' || args.at(-1) !== process.env.PI_TEST_PROMPT) {
    throw new Error('print prompt was not passed literally');
  }
  process.stdout.write('PROMPT_READY\n');
  process.exit(0);
}
const client = await connect({
  socketPath: process.env.PI_BROKER_SOCKET,
  agentId: process.env.PI_AGENT_ID,
  token: process.env.PI_AGENT_TOKEN,
});
try {
  const identity = await client.call('permit');
  if (identity.role !== 'root') throw new Error('wrong broker role');
  const directory = process.env.PI_TEST_JOURNAL;
  const [name] = await readdir(directory);
  const marker = JSON.parse(await readFile(join(directory, name), 'utf8'));
  if (marker.jobs[identity.id]?.pid !== process.pid || marker.jobs[identity.id]?.state !== 'running') {
    throw new Error('root process is not journaled');
  }
  await client.call('write', { path: 'created.txt', text: 'root wrote through broker', expectedHash: null });
  process.stdout.write('ROOT_READY\n');
} finally {
  await client.close();
}
if (process.env.PI_TEST_KEEP_RUNNING) await new Promise(resolve => setTimeout(resolve, 600));
