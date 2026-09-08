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
