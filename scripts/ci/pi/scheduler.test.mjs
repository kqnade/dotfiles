import assert from 'node:assert/strict';
import test from 'node:test';

import { Scheduler } from '../../../dot_pi/agent/runtime/scheduler.mjs';

const registration = (id, rootId = 'root') => ({
  id,
  rootId,
  role: id === rootId ? 'root' : 'astra',
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('root sessions are exempt while non-root sessions share their root limit', async () => {
  const scheduler = new Scheduler({ limit: 1 });
  scheduler.register(registration('root'));
  scheduler.register(registration('first'));
  scheduler.register(registration('second'));

  await scheduler.acquire('root');
  await scheduler.acquire('first');

  let secondAcquired = false;
  const second = scheduler.acquire('second').then(() => {
    secondAcquired = true;
  });

  await tick();
  assert.equal(secondAcquired, false);

  scheduler.release('first');
  await second;
  assert.equal(secondAcquired, true);
});

test('an already-aborted queued acquisition is rejected without leaking its slot', async () => {
  const scheduler = new Scheduler({ limit: 1 });
  scheduler.register(registration('root'));
  scheduler.register(registration('first'));
  scheduler.register(registration('waiting'));

  await scheduler.acquire('first');

  const signal = {
    aborted: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const waiting = scheduler.acquire('waiting', { signal });

  await tick();
  signal.aborted = true;
  scheduler.release('first');

  await assert.rejects(waiting, { name: 'AbortError' });
  await scheduler.acquire('waiting');
});
