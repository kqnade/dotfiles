import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { createApprovalServer, requestApproval } from '../../dot_pi/agent/extensions/lib/approval-channel.mjs';

const invocation = {
  toolName: 'bash', toolCallId: 'tool-1', cwd: '/tmp/child-work',
  input: { command: 'printf approved' }, childSessionId: 'child-session', purpose: '承認経路のテストです。',
};
const run = promisify(execFile);

async function serve(t, approve) {
  const server = await createApprovalServer(approve);
  t.after(() => server.close());
  return server;
}

test('a separate process receives only the decision for its exact invocation', async t => {
  let received;
  const server = await serve(t, async request => {
    received = request;
    return { allowed: true };
  });
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', `
    import { requestApproval } from ${JSON.stringify(new URL('../../dot_pi/agent/extensions/lib/approval-channel.mjs', import.meta.url).href)};
    const decision = await requestApproval(JSON.parse(process.env.TEST_ENDPOINT), JSON.parse(process.env.TEST_INVOCATION));
    console.log(JSON.stringify(decision));
  `], {
    env: { ...process.env, TEST_ENDPOINT: JSON.stringify(server.endpoint), TEST_INVOCATION: JSON.stringify(invocation) },
    timeout: 5000,
  });
  assert.deepEqual(JSON.parse(stdout), { allowed: true });
  assert.deepEqual(received, invocation);
});

test('rejects a different session token before prompting', async t => {
  const server = await serve(t, () => { assert.fail('unauthenticated prompt'); });
  await assert.rejects(requestApproval({ ...server.endpoint, token: '0'.repeat(64) }, invocation), /403/);
});

test('uses a private socket directory and removes it on shutdown', async t => {
  const server = await serve(t, async () => ({ allowed: false, reason: 'No' }));
  assert.equal((await stat(dirname(server.endpoint.socketPath))).mode & 0o777, 0o700);
  assert.equal((await stat(server.endpoint.socketPath)).mode & 0o777, 0o600);
  await server.close();
  await assert.rejects(stat(dirname(server.endpoint.socketPath)), { code: 'ENOENT' });
  await assert.rejects(requestApproval(server.endpoint, invocation));
});

test('denials are explicit and approvals are never cached', async t => {
  let calls = 0;
  const server = await serve(t, async () => ++calls === 1
    ? { allowed: true }
    : { allowed: false, reason: 'Declined' });
  assert.equal((await requestApproval(server.endpoint, invocation)).allowed, true);
  assert.deepEqual(await requestApproval(server.endpoint, invocation), { allowed: false, reason: 'Declined' });
  assert.equal(calls, 2);
});

test('a UI failure is a failed request, never permission', async t => {
  const server = await serve(t, async () => { throw new Error('UI unavailable'); });
  await assert.rejects(requestApproval(server.endpoint, invocation), /500/);
});

test('child cancellation reaches the parent and late consent is ignored', async t => {
  const opened = Promise.withResolvers();
  const cancelled = Promise.withResolvers();
  const answer = Promise.withResolvers();
  const server = await serve(t, async (_request, signal) => {
    signal.addEventListener('abort', () => cancelled.resolve(), { once: true });
    opened.resolve();
    return answer.promise;
  });
  const controller = new AbortController();
  const pending = requestApproval(server.endpoint, invocation, { signal: controller.signal });
  const rejected = assert.rejects(pending, /abort/i);
  await opened.promise;
  controller.abort();
  await rejected;
  await cancelled.promise;
  answer.resolve({ allowed: true });
});

test('parent shutdown revokes pending requests', async t => {
  const opened = Promise.withResolvers();
  const answer = Promise.withResolvers();
  const server = await serve(t, async () => { opened.resolve(); return answer.promise; });
  const rejected = assert.rejects(requestApproval(server.endpoint, invocation));
  await opened.promise;
  await server.close();
  await rejected;
  answer.resolve({ allowed: true });
});

test('unanswered requests expire without granting permission', async t => {
  const server = await serve(t, async () => new Promise(() => {}));
  await assert.rejects(requestApproval(server.endpoint, invocation, { timeoutMs: 30 }), /abort/i);
});

test('changing an invocation while approval is pending cannot reuse consent', async t => {
  const opened = Promise.withResolvers();
  const answer = Promise.withResolvers();
  const server = await serve(t, async () => { opened.resolve(); return answer.promise; });
  const mutable = structuredClone(invocation);
  const pending = requestApproval(server.endpoint, mutable);
  const rejected = assert.rejects(pending, /changed/);
  await opened.promise;
  mutable.input.command = 'different operation';
  answer.resolve({ allowed: true });
  await rejected;
});

test('oversized or malformed invocations cannot open a dialog', async t => {
  const server = await serve(t, () => { assert.fail('invalid prompt'); });
  await assert.rejects(requestApproval(server.endpoint, { ...invocation, cwd: 'relative' }), /400/);
  await assert.rejects(requestApproval(server.endpoint, { ...invocation, input: 'not an object' }), /400/);
  await assert.rejects(requestApproval(server.endpoint, { ...invocation, purpose: {} }), /400/);
  await assert.rejects(requestApproval(server.endpoint, { ...invocation, purpose: 'x'.repeat(1025) }), /400/);
  await assert.rejects(requestApproval(server.endpoint, { ...invocation, input: { command: 'x'.repeat(65536) } }), /too large/);
});
