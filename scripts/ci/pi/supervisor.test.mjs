import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Supervisor } from '../../../dot_pi/agent/runtime/supervisor.mjs';

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
