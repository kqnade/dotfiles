import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isReadOnlyTool, isDirectGitCommit, isForbiddenCommitBypass, confirmOneInvocation } from '../../dot_pi/agent/extensions/lib/execution-guard.mjs';
import executionGuard from '../../dot_pi/agent/extensions/execution-guard.ts';
import { APPROVAL_ENV, createApprovalServer } from '../../dot_pi/agent/extensions/lib/approval-channel.mjs';
import settings from '../../dot_pi/agent/settings.json' with { type: 'json' };

const invocation = { toolName: 'bash', input: { command: 'make test' } };

function guardHandlers(enabled) {
  const original = process.env.PI_EXECUTION_GUARD;
  const handlers = new Map();
  try {
    if (enabled === undefined) delete process.env.PI_EXECUTION_GUARD;
    else process.env.PI_EXECUTION_GUARD = enabled;
    executionGuard({ on: (event, callback) => { handlers.set(event, callback); } });
  } finally {
    if (original === undefined) delete process.env.PI_EXECUTION_GUARD;
    else process.env.PI_EXECUTION_GUARD = original;
  }
  return handlers;
}

function guardHandler(enabled) {
  return guardHandlers(enabled).get('tool_call');
}

test('a headless tool waits for its parent approval channel', async t => {
  let received;
  const server = await createApprovalServer(async request => { received = request; return { allowed: true }; });
  const original = process.env[APPROVAL_ENV];
  t.after(async () => {
    await server.close();
    if (original === undefined) delete process.env[APPROVAL_ENV];
    else process.env[APPROVAL_ENV] = original;
  });
  process.env[APPROVAL_ENV] = JSON.stringify(server.endpoint);
  const handlers = guardHandlers('1');
  const context = { hasUI: false, cwd: '/tmp/child', sessionManager: { getSessionId: () => 'child-session' } };
  await handlers.get('session_start')?.({}, context);
  t.after(() => handlers.get('session_shutdown')?.({}, context));
  const event = { ...invocation, toolCallId: 'tool-1' };
  assert.equal(await handlers.get('tool_call')(event, context), undefined);
  assert.deepEqual(received, { ...event, cwd: context.cwd, childSessionId: 'child-session' });
});

test('parent lifecycle routes a child call to the UI, then revokes its channel', async t => {
  const parent = guardHandlers('1');
  let displayed;
  let approve = true;
  const parentContext = {
    hasUI: true, cwd: '/tmp/parent',
    ui: { confirm: async (_title, message) => { displayed = message; return approve; } },
  };
  await parent.get('session_start')({}, parentContext);
  t.after(() => parent.get('session_shutdown')({}, parentContext));
  const firstChannel = process.env[APPROVAL_ENV];
  const child = guardHandlers('1');
  const childContext = {
    hasUI: false, cwd: '/tmp/child', sessionManager: { getSessionId: () => 'child-session' },
  };
  await child.get('session_start')({}, childContext);
  t.after(() => child.get('session_shutdown')({}, childContext));
  const event = { ...invocation, toolCallId: 'tool-1' };
  assert.equal(await child.get('tool_call')(event, childContext), undefined);
  assert.match(displayed, /"cwd": "\/tmp\/child"/);
  assert.match(displayed, /"childSessionId": "child-session"/);
  approve = false;
  assert.equal((await child.get('tool_call')(event, childContext)).block, true);
  await parent.get('session_shutdown')({}, parentContext);
  assert.equal(process.env[APPROVAL_ENV], undefined);
  assert.equal((await child.get('tool_call')(event, childContext)).block, true);
  await parent.get('session_start')({}, parentContext);
  assert.notEqual(process.env[APPROVAL_ENV], firstChannel);
  approve = true;
  assert.equal((await child.get('tool_call')(event, childContext)).block, true);
});

test('a separate headless extension requires parent consent by default', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-guard-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const parent = guardHandlers();
  let approve = true;
  let prompts = 0;
  const context = { hasUI: true, cwd: directory, ui: { confirm: async () => { prompts++; return approve; } } };
  await parent.get('session_start')({}, context);
  t.after(() => parent.get('session_shutdown')({}, context));
  const script = `
    import guard from ${JSON.stringify(new URL('../../dot_pi/agent/extensions/execution-guard.ts', import.meta.url).href)};
    import { writeFile } from 'node:fs/promises';
    const handlers = new Map();
    guard({ on: (event, handler) => handlers.set(event, handler) });
    const context = { hasUI: false, cwd: process.cwd(), sessionManager: { getSessionId: () => 'child-' + process.pid } };
    await handlers.get('session_start')({}, context);
    const event = { toolName: 'write', toolCallId: 'write-1', input: { path: process.env.TEST_TARGET, content: 'approved' } };
    const result = await handlers.get('tool_call')(event, context);
    if (!result?.block) await writeFile(event.input.path, event.input.content);
    await handlers.get('session_shutdown')({}, context);
    console.log(JSON.stringify({ blocked: result?.block === true }));
  `;
  for (const allowed of [true, false]) {
    approve = allowed;
    const target = join(directory, allowed ? 'approved' : 'denied');
    const env = { ...process.env, TEST_TARGET: target };
    delete env.PI_EXECUTION_GUARD;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
      cwd: directory, timeout: 5000, env,
    });
    assert.equal(JSON.parse(stdout).blocked, !allowed);
    if (allowed) assert.equal(await readFile(target, 'utf8'), 'approved');
    else await assert.rejects(readFile(target), { code: 'ENOENT' });
  }
  assert.equal(prompts, 2);
});

test('a second interactive owner cannot redirect an existing process channel', async t => {
  const parent = guardHandlers('1');
  const context = { hasUI: true, cwd: '/tmp/parent', ui: { confirm: async () => true } };
  await parent.get('session_start')({}, context);
  t.after(() => parent.get('session_shutdown')({}, context));
  const channel = process.env[APPROVAL_ENV];
  const other = guardHandlers('1');
  await assert.rejects(other.get('session_start')({}, context), /already owns/);
  t.after(() => other.get('session_shutdown')({}, context));
  assert.equal(process.env[APPROVAL_ENV], channel);
  assert.equal((await other.get('tool_call')(invocation, context)).block, true);
});

test('changing a displayed invocation invalidates approval', async () => {
  const changed = structuredClone(invocation);
  const result = await confirmOneInvocation(changed, {
    hasUI: true, cwd: '/tmp/work', ui: { confirm: async () => {
      changed.input.command = 'different operation';
      return true;
    } },
  });
  assert.equal(result.allowed, false);
});

test('strict approval is enabled unless explicitly opted out with 0', () => {
  for (const value of [undefined, '', '1', 'false', 'typo']) {
    assert.deepEqual([...guardHandlers(value).keys()], ['session_start', 'session_shutdown', 'tool_call']);
  }
  assert.equal(guardHandlers('0').size, 0);
});

test('configures the guard for native children and keeps external CLI profiles disabled', () => {
  assert.deepEqual(settings.subagents.defaultExtensions, ['~/.pi/agent/extensions/execution-guard.ts']);
  for (const name of ['claude-code', 'claude-code-writer', 'cursor-agent', 'cursor-agent-writer', 'codex-exec', 'codex-exec-writer']) {
    assert.equal(settings.subagents.agentOverrides[name].disabled, true, name);
  }
});

test('intercepts mutating, shell, and custom tool calls while allowing builtin reads', async () => {
  const handler = guardHandler('1');
  const noUi = { cwd: '/tmp/work', hasUI: false };
  assert.equal(await handler({ toolName: 'read', input: { path: 'file' } }, noUi), undefined);
  assert.equal((await handler({ toolName: 'custom', input: {} }, noUi)).block, true);
  assert.equal((await handler({ toolName: 'write', input: {} }, noUi)).block, true);
  assert.equal((await handler({ toolName: 'bash', input: { command: 'git commit -m x' } }, noUi)).block, true);
});

test('allows only the known read-only builtin tools without a prompt', () => {
  for (const name of ['read', 'grep', 'find', 'ls']) assert.equal(isReadOnlyTool(name), true);
  for (const name of ['bash', 'write', 'edit', 'powershell', 'unknown']) assert.equal(isReadOnlyTool(name), false);
});

test('blocks known git signing and hook bypasses instead of offering approval', () => {
  for (const command of ['git commit --no-gpg-sign -m x', 'git -c commit.gpgsign=false commit -m x', 'git commit --no-verify -m x', 'git -c core.hooksPath=/dev/null commit -m x', 'git -C . commit --no-verify -m x', 'git --no-pager -C "a b" commit --no-gpg-sign -m x']) {
    assert.equal(isForbiddenCommitBypass({ toolName: 'bash', input: { command } }), true, command);
  }
  assert.equal(isForbiddenCommitBypass(invocation), false);
  assert.equal(isDirectGitCommit({ toolName: 'bash', input: { command: 'git commit -m x' } }), true);
  assert.equal(isDirectGitCommit({ toolName: 'bash', input: { command: 'git cc' } }), false);
});

test('requires the native UI and refuses cancellation for one exact tool call and cwd', async () => {
  const noUi = await confirmOneInvocation(invocation, { cwd: '/tmp/work', hasUI: false });
  assert.deepEqual(noUi, { allowed: false, reason: 'No interactive approval UI is available.' });
  let shown;
  const denied = await confirmOneInvocation(invocation, {
    cwd: '/tmp/work', hasUI: true,
    ui: { confirm: async (title, message) => { shown = { title, message }; return false; } },
  });
  assert.equal(denied.allowed, false);
  assert.match(shown.message, /"cwd": "\/tmp\/work"/);
  assert.match(shown.message, /"command": "make test"/);
});

test('requires an affirmative boolean approval, not a truthy RPC value', async () => {
  for (const approved of [undefined, null, 'false', 1, {}]) {
    const result = await confirmOneInvocation(invocation, {
      cwd: '/tmp/work', hasUI: true, ui: { confirm: async () => approved },
    });
    assert.equal(result.allowed, false);
  }
});

test('propagates UI failures rather than treating them as approval', async () => {
  await assert.rejects(confirmOneInvocation(invocation, {
    cwd: '/tmp/work', hasUI: true,
    ui: { confirm: async () => { throw new Error('RPC cancelled'); } },
  }), /RPC cancelled/);
});

test('an already cancelled invocation opens no approval dialog', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await confirmOneInvocation(invocation, {
    cwd: '/tmp/work', hasUI: true, signal: controller.signal,
    ui: { confirm: async () => { assert.fail('cancelled dialog opened'); } },
  });
  assert.equal(result.allowed, false);
});

test('cancellation releases the queue and a late approval cannot authorize execution', async () => {
  const controller = new AbortController();
  let answer;
  const opened = Promise.withResolvers();
  const pending = confirmOneInvocation(invocation, {
    cwd: '/tmp/work', hasUI: true, signal: controller.signal,
    ui: { confirm: (_title, _message, options) => {
      assert.equal(options.signal, controller.signal);
      opened.resolve();
      return new Promise(resolve => { answer = resolve; });
    } },
  });
  await opened.promise;
  controller.abort();
  assert.equal((await pending).allowed, false);
  assert.equal((await confirmOneInvocation(invocation, {
    cwd: '/tmp/work', hasUI: true, ui: { confirm: async () => true },
  })).allowed, true);
  answer(true);
});

test('serializes overlapping approval dialogs', async () => {
  let active = 0;
  let maximum = 0;
  const confirm = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active -= 1;
    return true;
  };
  const ui = { cwd: '/tmp/work', hasUI: true, ui: { confirm } };
  const results = await Promise.all([
    confirmOneInvocation({ toolName: 'bash', input: { command: 'one' } }, ui),
    confirmOneInvocation({ toolName: 'bash', input: { command: 'two' } }, ui),
  ]);
  assert.deepEqual(results.map(result => result.allowed), [true, true]);
  assert.equal(maximum, 1);
});
