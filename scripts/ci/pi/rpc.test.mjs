import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RpcClient } from '../../../dot_pi/agent/runtime/rpc.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));

test('a substituted model prevents prompting', async () => {
  const client = new RpcClient({
    command: process.execPath,
    args: [fixture],
    env: { ...process.env, RPC_SUBSTITUTE: 'yes' },
  });
  try {
    await assert.rejects(client.initialize('astra'), /model mismatch/);
    await assert.rejects(client.run('Reply OK.'), /not verified/);
  } finally {
    await client.close();
  }
});

test('run waits for the completed assistant response and preserves Unicode separators', async () => {
  const client = new RpcClient({ command: process.execPath, args: [fixture] });
  try {
    await client.initialize('luna');
    assert.deepEqual(await client.run('Reply OK.'), { text: 'OK\u2028verified', model: 'gpt-5.6-luna' });
  } finally {
    await client.close();
  }
});
