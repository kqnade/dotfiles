import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnlyTool, isDirectGitCommit, isForbiddenCommitBypass, confirmOneInvocation } from '../../dot_pi/agent/extensions/lib/execution-guard.mjs';
import executionGuard from '../../dot_pi/agent/extensions/execution-guard.ts';
import settings from '../../dot_pi/agent/settings.json' with { type: 'json' };

const invocation = { toolName: 'bash', input: { command: 'make test' } };

function guardHandler(enabled) {
  const original = process.env.PI_EXECUTION_GUARD;
  let handler;
  try {
    if (enabled === undefined) delete process.env.PI_EXECUTION_GUARD;
    else process.env.PI_EXECUTION_GUARD = enabled;
    executionGuard({ on: (event, callback) => { assert.equal(event, 'tool_call'); handler = callback; } });
  } finally {
    if (original === undefined) delete process.env.PI_EXECUTION_GUARD;
    else process.env.PI_EXECUTION_GUARD = original;
  }
  return handler;
}

test('strict approval is opt-in so ordinary native workers remain usable', () => {
  assert.equal(guardHandler(undefined), undefined);
  assert.equal(guardHandler('0'), undefined);
  assert.equal(typeof guardHandler('1'), 'function');
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
  assert.match(shown.message, /cwd: \/tmp\/work/);
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
