import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Supervisor } from '../../../dot_pi/agent/runtime/supervisor.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scopes } from '../../../dot_pi/agent/runtime/scopes.mjs';

test('only Sol escalation can create Astra and leaf roles cannot delegate', async () => {
  const executed = [];
  const supervisor = new Supervisor({
    rootId: 'session',
    execute: async agent => {
      executed.push(agent.role);
      if (agent.role === 'astra') {
        return { stopped: true, result: await supervisor.delegate(agent.id, [{ role: 'luna', task: 'inspect' }]) };
      }
      await assert.rejects(supervisor.delegate(agent.id, [{ role: 'astra', task: 'escape' }]), /cannot delegate/);
      return { stopped: true, result: 'done' };
    },
  });
  await assert.rejects(supervisor.delegate('session', [{ role: 'spark', task: 'skip orchestration' }]), /cannot delegate/);
  const results = await supervisor.delegate('session', [{ role: 'astra', task: 'coordinate' }]);
  assert.deepEqual(executed, ['astra', 'luna']);
  assert.equal(results[0].result[0].result, 'done');
  assert.equal(supervisor.snapshot().available, 4);
});

test('Sol escalates to its waiting Astra without starting another Astra execution', async () => {
  let astraRuns = 0;
  const supervisor = new Supervisor({ rootId:'root', execute: async agent => {
    if (agent.role === 'astra') {
      astraRuns += 1;
      const [child] = await supervisor.delegate(agent.id, [{role:'sol', task:'implement'}]);
      assert.equal(child.result.status, 'escalated');
      assert.equal(child.result.to, agent.id);
      assert.equal(child.result.reason, 'algorithm needs Astra');
      return { stopped:true, result:'Astra completed algorithm' };
    }
    await supervisor.escalate(agent.id, 'algorithm needs Astra');
    return { stopped:true };
  }});
  const [result] = await supervisor.delegate('root', [{role:'astra',task:'coordinate'}]);
  assert.equal(result.result, 'Astra completed algorithm');
  assert.equal(astraRuns, 1);
  assert.equal(supervisor.snapshot().available, 4);
});

test('delegation drains the parent scope and returns child edits before resuming', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-supervisor-scope-'));
  try {
    await writeFile(join(cwd, 'code.txt'), 'old');
    const scopes = new Scopes({ cwd, rootId: 'root' });
    const supervisor = new Supervisor({ rootId:'root', scopes, execute: async agent => {
      await assert.rejects(scopes.write('root','code.txt','overlap'), /draining/);
      await scopes.write(agent.id, 'code.txt', 'child');
      return { stopped:true, result:'done' };
    }});
    await supervisor.delegate('root', [{role:'astra', task:'fix', paths:['code.txt']}]);
    assert.equal(await readFile(join(cwd,'code.txt'),'utf8'), 'child');
    await scopes.write('root','code.txt','resumed');
    assert.equal(await readFile(join(cwd,'code.txt'),'utf8'), 'resumed');
  } finally { await rm(cwd, {recursive:true,force:true}); }
});

test('a result without terminal proof is quarantined', async () => {
  const supervisor = new Supervisor({ rootId: 'session', execute: async () => ({ result: 'done' }) });
  await assert.rejects(supervisor.delegate('session', [{ role: 'astra', task: 'coordinate' }]), /Delegated tasks failed/);
  assert.equal(supervisor.snapshot().available, 3);
  assert.equal(supervisor.snapshot().quarantined.length, 1);
});

test('an unconfirmed execution failure cannot free its occupied slot', async () => {
  const supervisor = new Supervisor({
    rootId: 'session',
    execute: async () => { throw new Error('process stop is unknown'); },
  });
  await assert.rejects(supervisor.delegate('session', [{ role: 'astra', task: 'coordinate' }]), /Delegated tasks failed/);
  assert.equal(supervisor.snapshot().available, 3);
});

test('an unconfirmed scoped worker preserves its failure and quarantines its writes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-supervisor-quarantine-'));
  try {
    await writeFile(join(cwd, 'code.txt'), 'source');
    const scopes = new Scopes({ cwd, rootId: 'root' });
    const failure = new Error('worker process group could not be inspected');
    let childId;
    const supervisor = new Supervisor({ rootId: 'root', scopes, execute: async agent => {
      childId = agent.id;
      throw failure;
    }});
    await assert.rejects(
      supervisor.delegate('root', [{ role: 'astra', task: 'work', paths: ['code.txt'] }]),
      error => error instanceof AggregateError && error.errors.includes(failure),
    );
    await assert.rejects(scopes.write(childId, 'code.txt', 'late child write'), /quarantined/);
    await assert.rejects(scopes.write('root', 'code.txt', 'early parent write'), /draining/);
    assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'source');
    assert.equal(supervisor.snapshot().available, 3);
    assert.deepEqual(supervisor.snapshot().quarantined, [childId]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('root cancellation removes queued descendants and returns their borrowed scopes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-supervisor-cancel-'));
  const controller = new AbortController();
  const ready = Promise.withResolvers();
  const release = Promise.withResolvers();
  try {
    const files = Array.from({ length: 5 }, (_, index) => `file-${index}.txt`);
    for (const file of files) await writeFile(join(cwd, file), 'source');
    const scopes = new Scopes({ cwd, rootId: 'root' });
    let leaves = 0;
    const supervisor = new Supervisor({ rootId: 'root', scopes, execute: async agent => {
      if (agent.role === 'astra') {
        try {
          return { stopped: true, result: await supervisor.delegate(agent.id, files.map(file => ({
            role: 'luna', task: 'inspect', paths: [file],
          }))) };
        } catch (error) {
          return { stopped: true, error };
        }
      }
      leaves += 1;
      if (leaves === 4) ready.resolve();
      await release.promise;
      return { stopped: true, result: 'done' };
    }});
    const outcome = supervisor.delegate('root', [{ role: 'astra', task: 'coordinate', paths: ['.'] }], {
      signal: controller.signal,
    }).then(value => ({ value }), error => ({ error }));
    await ready.promise;
    assert.equal(supervisor.snapshot().queued.length, 1);
    controller.abort();
    release.resolve();
    const result = await outcome;
    assert.ok(result.error instanceof AggregateError, 'cancellation must fail the delegation');
    assert.equal(leaves, 4);
    assert.equal(supervisor.snapshot().queued.length, 0);
    assert.equal(supervisor.snapshot().available, 4);
    assert.equal(supervisor.snapshot().quarantined.length, 0);
    await scopes.write('root', files[4], 'resumed');
    assert.equal(await readFile(join(cwd, files[4]), 'utf8'), 'resumed');
  } finally {
    release.resolve();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('cancelling a nested request lets its live Astra parent reacquire and continue', async () => {
  const controller = new AbortController();
  const lunaStarted = Promise.withResolvers();
  let astraPermit;
  let nestedFailure;
  let supervisor;
  supervisor = new Supervisor({
    rootId: 'root',
    execute: async agent => {
      if (agent.role === 'astra') {
        try {
          await supervisor.delegate(agent.id, [{ role: 'luna', task: 'cancel me' }], {
            signal: controller.signal,
          });
        } catch (error) {
          nestedFailure = error;
        }
        astraPermit = supervisor.permit(agent.id);
        return { stopped: true, result: 'Astra continued' };
      }
      lunaStarted.resolve();
      await new Promise(resolve => agent.signal.addEventListener('abort', resolve, { once: true }));
      return { stopped: true, error: new Error('Luna cancelled') };
    },
  });

  const [result] = await (async () => {
    const operation = supervisor.delegate('root', [{ role: 'astra', task: 'coordinate' }]);
    await lunaStarted.promise;
    controller.abort();
    return operation;
  })();

  assert.ok(nestedFailure instanceof AggregateError);
  assert.equal(astraPermit.role, 'astra');
  assert.equal(typeof astraPermit.id, 'string');
  assert.equal(result.result, 'Astra continued');
  assert.equal(supervisor.snapshot().available, 4);
});
