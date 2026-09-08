import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { startBroker } from '../../../dot_pi/agent/runtime/broker.mjs';
import { connect } from '../../../dot_pi/agent/runtime/ipc.mjs';
import { sha256 } from '../../../dot_pi/agent/runtime/ownership.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));

test('the authenticated root reads and updates a file through the broker', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-broker-test-'));
  let broker;
  let client;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    broker = await startBroker({ cwd, directory: join(cwd, 'journal'), command: process.execPath, args: [fixture] });
    client = await connect(broker.connection);
    assert.equal((await client.call('permit')).role, 'root');
    const original = await client.call('read', { path: 'code.txt' });
    assert.equal(original.text, 'source');
    assert.equal(original.hash, sha256('source'));
    const result = await client.call('write', { path: 'code.txt', text: 'edited', expectedHash: original.hash });
    assert.equal(result.hash, sha256('edited'));
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'edited');
    await assert.rejects(client.call('write', { path: 'code.txt', text: 'stale', expectedHash: original.hash }), /preimage hash mismatch/);
  } finally {
    await client?.close();
    await broker?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
