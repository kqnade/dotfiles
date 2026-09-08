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
        return supervisor.delegate(agent.id, [{ role: 'luna', task: 'inspect' }]);
      }
      await assert.rejects(supervisor.delegate(agent.id, [{ role: 'astra', task: 'escape' }]), /cannot delegate/);
      return 'done';
    },
  });
  await assert.rejects(supervisor.delegate('session', [{ role: 'spark', task: 'skip orchestration' }]), /cannot delegate/);
  const results = await supervisor.delegate('session', [{ role: 'astra', task: 'coordinate' }]);
  assert.deepEqual(executed, ['astra', 'luna']);
  assert.equal(results[0].result[0].result, 'done');
  assert.equal(supervisor.snapshot().available, 4);
});
