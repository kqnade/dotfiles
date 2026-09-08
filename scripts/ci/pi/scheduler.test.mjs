import assert from 'node:assert/strict';
import test from 'node:test';

import { Scheduler } from '../../../dot_pi/agent/runtime/scheduler.mjs';

const registration = (id, rootId = 'root', options = {}) => ({
  id,
  rootId,
  role: id === rootId ? 'root' : 'astra',
  ...options,
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

test('park frees the parent slot and resume requests retain FIFO order', async () => {
  const scheduler = new Scheduler({ limit: 1 });
  scheduler.register(registration('root'));
  scheduler.register(registration('parent', 'root', { role: 'astra' }));
  scheduler.register(registration('child', 'root', { parentId: 'parent', role: 'sol' }));
  scheduler.register(registration('newcomer', 'root', { role: 'spark' }));

  await scheduler.acquire('parent');
  const childReady = scheduler.acquire('child');
  await tick();
  assert.equal(scheduler.snapshot('root').available, 0);
  assert.deepEqual(scheduler.snapshot('root').active, ['parent']);
  assert.deepEqual(scheduler.snapshot('root').queued, ['child']);

  await scheduler.park('parent');
  await childReady;
  assert.deepEqual(scheduler.snapshot('root').active, ['child']);
  assert.deepEqual(scheduler.snapshot('root').parked, ['parent']);

  const order = [];
  const parentReady = scheduler.resume('parent').then(() => order.push('parent'));
  const newcomerReady = scheduler.acquire('newcomer').then(() => order.push('newcomer'));
  await tick();
  assert.deepEqual(scheduler.snapshot('root').queued, ['parent', 'newcomer']);
  assert.deepEqual(scheduler.snapshot('root').resumeQueue, ['parent']);
  assert.deepEqual(scheduler.snapshot('root').runnableQueue, ['newcomer']);

  scheduler.release('child');
  await parentReady;
  assert.deepEqual(order, ['parent']);
  assert.deepEqual(scheduler.snapshot('root').active, ['parent']);
  assert.deepEqual(scheduler.snapshot('root').queued, ['newcomer']);

  scheduler.release('parent');
  await newcomerReady;
  assert.deepEqual(order, ['parent', 'newcomer']);
});

test('an unconfirmed release quarantines its charged slot until terminal confirmation', async () => {
  const scheduler = new Scheduler({ limit: 1 });
  scheduler.register(registration('root'));
  scheduler.register(registration('active'));
  scheduler.register(registration('waiting'));

  await scheduler.acquire('active');
  let waitingAcquired = false;
  const waiting = scheduler.acquire('waiting').then(() => {
    waitingAcquired = true;
  });

  scheduler.release('active', { confirmed: false });
  assert.deepEqual(scheduler.snapshot('root').quarantined, ['active']);
  assert.equal(scheduler.snapshot('root').available, 0);
  await tick();
  assert.equal(waitingAcquired, false);

  scheduler.release('active');
  await waiting;
  assert.equal(waitingAcquired, true);
  assert.deepEqual(scheduler.snapshot('root').quarantined, []);
  assert.deepEqual(scheduler.snapshot('root').active, ['waiting']);

  scheduler.release('active');
  assert.deepEqual(scheduler.snapshot('root').active, ['waiting']);
  scheduler.release('waiting');
});

test('a non-root agent must reference a registered root agent', () => {
  const scheduler = new Scheduler({ limit: 1 });
  scheduler.register(registration('root'));
  scheduler.register(registration('parent'));

  assert.throws(
    () => scheduler.register(registration('orphan', 'parent', { role: 'sol' })),
    /root parent is not registered/,
  );
});
