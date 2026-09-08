import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { startSession } from '../../../dot_pi/agent/runtime/session.mjs';

const fixture = fileURLToPath(new URL('./fixtures/rpc-child.mjs', import.meta.url));

test('a session journals its scoped RPC worker before prompting and confirms its stop', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-session-'));
  const directory = join(cwd, 'journal');
  let session;
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    session = await startSession({
      cwd, directory, rootId: 'root', command: process.execPath, args: [fixture],
      env: { ...process.env, RPC_REQUIRE_JOURNAL: directory },
    });
    const [result] = await session.delegate([{ role: 'astra', task: 'Reply OK.', paths: ['./code.txt'] }]);
    assert.deepEqual(result.result, { text: 'OK\u2028verified', model: 'gpt-6-astra' });
    const [name] = await readdir(directory);
    const marker = JSON.parse(await readFile(join(directory, name), 'utf8'));
    const job = marker.jobs[result.id];
    assert.equal(job.state, 'stopped');
    assert.equal(job.role, 'astra');
    assert.deepEqual(job.paths, [join(cwd, 'code.txt')]);
    assert.notEqual(job.pid, process.pid);
    assert.throws(() => process.kill(-job.pid, 0), { code: 'ESRCH' });
    assert.equal(session.snapshot().available, 4);
    await session.close();
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await session?.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
