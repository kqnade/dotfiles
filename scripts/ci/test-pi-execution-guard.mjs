import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { approvalReason, isDirectGitCommit, isForbiddenCommitBypass, confirmOneInvocation, toolCallPurpose, MAX_PURPOSE_LENGTH } from '../../dot_pi/agent/extensions/lib/execution-guard.mjs';
import executionGuard from '../../dot_pi/agent/extensions/execution-guard.ts';
import { APPROVAL_ENV, createApprovalServer } from '../../dot_pi/agent/extensions/lib/approval-channel.mjs';
import settings from '../../dot_pi/agent/settings.json' with { type: 'json' };

const invocation = { toolName: 'bash', input: { command: 'git push origin trunk' } };

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
  const context = { hasUI: false, cwd: '/tmp/child', sessionManager: { getSessionId: () => 'child-session', getBranch: () => [] } };
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
    hasUI: false, cwd: '/tmp/child', sessionManager: {
      getSessionId: () => 'child-session',
      getBranch: () => [{ type: 'message', message: { role: 'assistant', content: [
        { type: 'text', text: '子の操作目的です。' }, { type: 'toolCall', id: 'tool-1' },
      ] } }],
    },
  };
  await child.get('session_start')({}, childContext);
  t.after(() => child.get('session_shutdown')({}, childContext));
  const event = { ...invocation, toolCallId: 'tool-1' };
  assert.equal(await child.get('tool_call')(event, childContext), undefined);
  assert.match(displayed, /作業場所: \/tmp\/child/);
  assert.match(displayed, /子session: child-session/);
  assert.match(displayed, /子の操作目的です/);
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

test('a separate headless extension gates a simulated external operation by default', async t => {
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
    const context = { hasUI: false, cwd: process.cwd(), sessionManager: { getSessionId: () => 'child-' + process.pid, getBranch: () => [] } };
    await handlers.get('session_start')({}, context);
    const event = { toolName: 'bash', toolCallId: 'external-1', input: { command: 'curl https://example.invalid' } };
    const result = await handlers.get('tool_call')(event, context);
    if (!result?.block) await writeFile(process.env.TEST_TARGET, 'approved');
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

test('external-operation approval is enabled unless explicitly opted out with 0', () => {
  for (const value of [undefined, '', '1', 'false', 'typo']) {
    assert.deepEqual([...guardHandlers(value).keys()], ['session_start', 'session_shutdown', 'before_agent_start', 'tool_call']);
  }
  assert.equal(guardHandlers('0').size, 0);
});

test('approval shows readable multiline input followed by the purpose instead of JSON', async () => {
  let shown;
  await confirmOneInvocation({
    toolName: 'bash', toolCallId: 'call-1', childSessionId: 'child-1',
    input: { command: 'git status --short\ngit push origin trunk', timeout: 10 },
    purpose: '検証済みの変更をリモートへ送信します。',
  }, { hasUI: true, cwd: '/tmp/work', ui: { confirm: async (_title, message) => { shown = message; return false; } } });
  assert.match(shown, /操作: シェルコマンドを実行 \(bash\)/);
  assert.match(shown, /作業場所: \/tmp\/work/);
  assert.match(shown, /子session: child-1/);
  assert.ok(shown.includes('  git status --short\n  git push origin trunk'));
  assert.match(shown, /timeout: 10/);
  assert.match(shown, /確認理由: Gitリモート/);
  assert.match(shown, /目的（agentの説明・参考）:\n  検証済みの変更をリモートへ送信します/);
  assert.ok(shown.indexOf('目的（') > shown.indexOf('コマンド:'));
  assert.doesNotMatch(shown, /"(?:input|command|cwd)":/);
});

test('changing only the displayed purpose invalidates approval', async () => {
  const mutable = { ...invocation, purpose: 'Original purpose' };
  const result = await confirmOneInvocation(mutable, {
    hasUI: true, cwd: '/tmp/work', ui: { confirm: async () => {
      mutable.purpose = 'Different purpose';
      return true;
    } },
  });
  assert.equal(result.allowed, false);
});

test('purpose comes only from public text immediately preceding this tool call', async t => {
  const handlers = guardHandlers();
  let shown;
  const context = {
    hasUI: true, cwd: '/tmp/work', ui: { confirm: async (_title, message) => { shown = message; return false; } },
    sessionManager: { getBranch: () => [
      { type: 'message', message: { role: 'assistant', content: [
        { type: 'text', text: 'Unrelated old explanation' }, { type: 'toolCall', id: 'old' },
      ] } },
      { type: 'message', message: { role: 'assistant', content: [
        { type: 'thinking', thinking: 'Private reasoning' },
        { type: 'text', text: '検証済みの変更をリモートへ送信します。' },
        { type: 'toolCall', id: 'current' }, { type: 'toolCall', id: 'no-purpose' },
        { type: 'text', text: 'Unrelated later explanation' },
      ] } },
    ] },
  };
  await handlers.get('session_start')({}, context);
  t.after(() => handlers.get('session_shutdown')({}, context));
  await handlers.get('tool_call')({ ...invocation, toolCallId: 'current' }, context);
  assert.match(shown, /検証済みの変更をリモートへ送信/);
  assert.doesNotMatch(shown, /Unrelated|Private reasoning/);
  for (const toolCallId of ['no-purpose', 'absent']) {
    await handlers.get('tool_call')({ ...invocation, toolCallId }, context);
    assert.match(shown, /目的の説明は添えられていません/);
    assert.doesNotMatch(shown, /検証済みの変更/);
  }
});

test('the purpose guideline preserves existing prompt rules without duplication', () => {
  const handler = guardHandlers().get('before_agent_start');
  assert.equal(typeof handler, 'function');
  const event = { systemPromptOptions: { promptGuidelines: ['Existing rule'] } };
  handler(event);
  handler(event);
  assert.equal(event.systemPromptOptions.promptGuidelines.length, 2);
  assert.equal(event.systemPromptOptions.promptGuidelines[0], 'Existing rule');
  assert.match(event.systemPromptOptions.promptGuidelines[1], /目的.*日本語/);
});

test('purpose text is bounded without splitting Unicode characters', () => {
  const branch = [{ type: 'message', message: { role: 'assistant', content: [
    { type: 'text', text: '😀'.repeat(600) }, { type: 'toolCall', id: 'current' },
  ] } }];
  const purpose = toolCallPurpose(branch, 'current');
  assert.ok(purpose.length <= MAX_PURPOSE_LENGTH);
  assert.equal(purpose, '😀'.repeat(500) + '…（以下省略）');
});

test('readable approval preserves nested fields and escapes terminal controls', async () => {
  let shown;
  await confirmOneInvocation({ toolName: 'custom', toolCallId: 'id\nspoof', input: {
    path: 'example.txt', edits: [{ oldText: 'before\nline', newText: 'after\nline' }],
    options: { enabled: false, missing: null, emptyList: [], emptyObject: {} },
    text: '\x1b[2J\rhidden\u202e',
  }, purpose: '\x1b[8mexample' }, {
    hasUI: true, cwd: '/tmp/work', ui: { confirm: async (_title, message) => { shown = message; return false; } },
  });
  assert.match(shown, /対象ファイル: example.txt/);
  assert.match(shown, /変更前:\n\s+before\n\s+line/);
  assert.match(shown, /変更後:\n\s+after\n\s+line/);
  assert.match(shown, /enabled: false/);
  assert.match(shown, /missing: null/);
  assert.match(shown, /emptyList: （空の配列）/);
  assert.match(shown, /emptyObject: （空のオブジェクト）/);
  assert.doesNotMatch(shown, /[\x1b\r\u202e]/);
  assert.ok(shown.includes('\\u001b[2J\\u000dhidden\\u202e'));
  assert.ok(shown.includes('呼出ID: id\\nspoof'));
});

test('readable display does not weaken the exact argument comparison', async () => {
  const mutable = { toolName: 'custom', input: { value: true } };
  const result = await confirmOneInvocation(mutable, {
    hasUI: true, cwd: '/tmp/work', ui: { confirm: async () => { mutable.input.value = 'true'; return true; } },
  });
  assert.equal(result.allowed, false);
});

test('configures the guard for native children and keeps external CLI profiles disabled', () => {
  assert.deepEqual(settings.subagents.defaultExtensions, ['~/.pi/agent/extensions/execution-guard.ts']);
  for (const name of ['claude-code', 'claude-code-writer', 'cursor-agent', 'cursor-agent-writer', 'codex-exec', 'codex-exec-writer']) {
    assert.equal(settings.subagents.agentOverrides[name].disabled, true, name);
  }
});

test('local operations need no approval UI or channel', async () => {
  const handler = guardHandler();
  const context = { cwd: '/tmp/work', hasUI: false };
  for (const toolName of ['read', 'grep', 'find', 'ls', 'edit', 'write', 'lsp', 'ask_user', 'subagent', 'custom']) {
    assert.equal(await handler({ toolName, input: {} }, context), undefined, toolName);
  }
  for (const command of ['git status --short', 'git diff', 'git cc', 'npm test', 'mise exec -- node --test', "printf '%s\\n' 'git push'"]) {
    assert.equal(await handler({ toolName: 'bash', input: { command } }, context), undefined, command);
  }
});

test('external operations still require approval and commit bypasses remain blocked', async () => {
  const handler = guardHandler();
  const context = { cwd: '/tmp/work', hasUI: false };
  for (const toolName of ['web_search', 'source_check', 'fetch_content']) {
    assert.equal((await handler({ toolName, input: {} }, context)).block, true, toolName);
  }
  for (const command of ['git push origin trunk', 'git -C "a b" fetch origin', 'curl https://example.invalid', 'gh pr create', 'npm publish', 'npm test && git push', 'git commit --no-verify']) {
    assert.equal((await handler({ toolName: 'bash', input: { command } }, context)).block, true, command);
  }
});

test('recognizes common external command forms without claiming to inspect scripts', () => {
  for (const command of ['git --no-pager ls-remote origin', 'git remote update', 'sudo /usr/bin/curl https://example.invalid', 'TOKEN=x curl https://example.invalid', 'echo $(curl https://example.invalid)', 'gh -R owner/repo pr merge', 'pnpm install', 'mise install', 'kubectl apply -f deployment.yaml']) {
    assert.equal(typeof approvalReason({ toolName: 'bash', input: { command } }), 'string', command);
  }
  for (const command of ['git log -1', 'python3 local-script.py', 'gh --version', 'ssh-keygen -l -f key.pub', 'ssh-add -l']) {
    assert.equal(approvalReason({ toolName: 'bash', input: { command } }), undefined, command);
  }
  assert.equal(typeof approvalReason({ toolName: 'powershell', input: { command: 'Invoke-WebRequest https://example.invalid' } }), 'string');
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
  assert.match(shown.message, /作業場所: \/tmp\/work/);
  assert.match(shown.message, /コマンド:\n  git push origin trunk/);
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
