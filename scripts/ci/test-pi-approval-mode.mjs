import { test } from 'node:test';
import assert from 'node:assert/strict';
import executionGuard from '../../dot_pi/agent/extensions/execution-guard.ts';
import { APPROVAL_ENV, requestApproval } from '../../dot_pi/agent/extensions/lib/approval-channel.mjs';

const answer = risk => new Response(JSON.stringify({ answers: [{ type: 'choice', name: 'guardian_risk', choice: risk }] }));

function loadGuard(mode) {
  const previous = process.env.PI_APPROVAL_REVIEWER;
  process.env.PI_APPROVAL_REVIEWER = mode;
  const handlers = new Map(), commands = new Map();
  try {
    executionGuard({
      on: (name, handler) => handlers.set(name, handler),
      registerCommand: (name, command) => commands.set(name, command),
      events: { emit() {} },
    });
  } finally {
    if (previous === undefined) delete process.env.PI_APPROVAL_REVIEWER;
    else process.env.PI_APPROVAL_REVIEWER = previous;
  }
  return { handlers, commands };
}

async function setup(t, mode = 'user') {
  const variables = ['PI_EXECUTION_GUARD', 'PI_APPROVAL_REVIEWER', 'PI_DECISION_API_KEY', APPROVAL_ENV];
  const saved = Object.fromEntries(variables.map(name => [name, process.env[name]]));
  const fetch = globalThis.fetch;
  const state = { idle: true, risk: 'low', approve: false, purpose: undefined, pick: undefined,
    requests: [], notifications: [], dialogs: [], fetch: undefined, picker: undefined };
  process.env.PI_EXECUTION_GUARD = '1';
  process.env.PI_APPROVAL_REVIEWER = mode;
  process.env.PI_DECISION_API_KEY = 'fixture-key';
  delete process.env[APPROVAL_ENV];
  globalThis.fetch = async (_url, options) => {
    state.requests.push(JSON.parse(options.body));
    return state.fetch ? state.fetch(options) : answer(state.risk);
  };
  const runtime = loadGuard(mode);
  const context = {
    hasUI: true, mode: 'rpc', cwd: '/tmp/approval-mode', isIdle: () => state.idle,
    ui: {
      notify: (message, type) => state.notifications.push({ message, type }),
      select: async (title, choices) => {
        assert.match(title, /decision|allowall|user/);
        assert.deepEqual(choices, ['decision', 'allowall', 'user']);
        return state.picker ? state.picker() : state.pick;
      },
      confirm: async (title, message) => { state.dialogs.push({ title, message }); return state.approve; },
    },
    sessionManager: { getBranch: () => [
      { type: 'message', message: { role: 'user', content: 'Run local commands and tests. Do not change remote state.' } },
      { type: 'message', message: { role: 'assistant', content: [
        ...(state.purpose ? [{ type: 'text', text: state.purpose }] : []), { type: 'toolCall', id: 'call' },
      ] } },
    ] },
  };
  t.after(async () => {
    await runtime.handlers.get('session_shutdown')({}, context);
    globalThis.fetch = fetch;
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  await runtime.handlers.get('session_start')({}, context);
  runtime.handlers.get('before_agent_start')({ systemPromptOptions: { contextFiles: [], promptGuidelines: [] } });
  return { ...runtime, state, context };
}

function command(runtime) {
  const definition = runtime.commands.get('approval-mode');
  assert.ok(definition, '/approval-mode is registered');
  return args => definition.handler(args, runtime.context);
}

const call = command => ({ toolName: 'bash', toolCallId: 'call', input: { command } });

test('slash commands change the active parent policy and inherited mode without disabling the guard', async t => {
  const runtime = await setup(t);
  const change = command(runtime);
  await change('allowall');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'allowall');
  assert.notEqual(process.env.PI_EXECUTION_GUARD, '0');
  assert.equal(await runtime.handlers.get('tool_call')(call('chmod +x script.sh'), runtime.context), undefined);
  assert.match(runtime.state.requests.at(-1).questions[0].instructions, /AllowAll/);
  await change('decision');
  assert.match((await runtime.handlers.get('tool_call')(call('chmod +x script.sh'), runtime.context)).reason, /目的/);
  assert.equal(runtime.state.requests.length, 1);
  assert.equal(await runtime.handlers.get('tool_call')(call('git status'), runtime.context), undefined);
  assert.doesNotMatch(runtime.state.requests.at(-1).questions[0].instructions, /AllowAll/);
  await change('user');
  assert.equal(await runtime.handlers.get('tool_call')(call('git status'), runtime.context), undefined);
  assert.equal(runtime.state.requests.length, 2);
  runtime.state.purpose = 'ローカルスクリプトの実行権限を変更します。';
  assert.equal((await runtime.handlers.get('tool_call')(call('chmod +x script.sh'), runtime.context)).block, true);
  assert.equal(runtime.state.dialogs.length, 1);
  for (const mode of ['decision', 'allowall', 'user']) {
    await change(mode);
    assert.equal((await runtime.handlers.get('tool_call')(call('git commit --no-verify -m fixture'), runtime.context)).block, true);
  }
});

test('status, selection, cancellation and invalid values do not silently change the mode', async t => {
  const runtime = await setup(t);
  const change = command(runtime);
  await change('status');
  assert.match(runtime.state.notifications.at(-1).message, /user/);
  await change('');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'user');
  for (const value of ['off', 'allowall extra']) {
    await change(value);
    assert.equal(runtime.state.notifications.at(-1).type, 'error');
    assert.equal(process.env.PI_APPROVAL_REVIEWER, 'user');
  }
  runtime.state.pick = 'allowall';
  await change('');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'allowall');
  assert.deepEqual(runtime.commands.get('approval-mode').getArgumentCompletions('a'), [{ value: 'allowall', label: 'allowall' }]);
  runtime.state.idle = false;
  await change('decision');
  assert.equal(runtime.state.notifications.at(-1).type, 'warning');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'allowall');
  await change('status');
  assert.match(runtime.state.notifications.at(-1).message, /allowall/);
});

test('an existing user-mode child follows every subsequent parent mode, including nested calls', async t => {
  const runtime = await setup(t);
  const change = command(runtime);
  const child = loadGuard('user');
  const childContext = { hasUI: false, cwd: '/tmp/approval-mode-child', sessionManager: {
    getBranch: () => [], getSessionId: () => 'child',
  } };
  t.after(() => child.handlers.get('session_shutdown')({}, childContext));
  await child.handlers.get('session_start')({}, childContext);
  const invoke = event => child.handlers.get('tool_call')(event, childContext);
  assert.equal(await invoke(call('git status')), undefined);
  assert.equal(runtime.state.requests.length, 0);
  await change('decision');
  assert.equal(await invoke(call('git status')), undefined);
  assert.equal(runtime.state.requests.length, 1);
  await change('allowall');
  assert.equal(await invoke(call('chmod +x script.sh')), undefined);
  assert.match(runtime.state.requests.at(-1).questions[0].instructions, /AllowAll/);
  const nested = { toolName: 'mcp__fixture__read', toolCallId: 'call/1', parentToolCallId: 'call', input: {} };
  await change('decision');
  assert.match((await invoke(nested)).reason, /直接/);
  await change('allowall');
  assert.equal(await invoke(nested), undefined);
  runtime.state.risk = 'high';
  assert.match((await invoke(nested)).reason, /目的/);
  assert.equal(runtime.state.dialogs.length, 0);
  const forged = await requestApproval(JSON.parse(process.env[APPROVAL_ENV]), {
    ...nested, cwd: childContext.cwd, childSessionId: 'child', purpose: '親の呼び出しに付けた説明です。',
  });
  assert.equal(forged.allowed, false);
  assert.match(forged.reason, /目的/);
  assert.equal(runtime.state.dialogs.length, 0);
  await assert.rejects(child.commands.get('approval-mode').handler('allowall', { ...childContext, ui: runtime.context.ui }), /親/);
});

test('mode changes are rejected while an API review is pending', async t => {
  const runtime = await setup(t, 'decision');
  const change = command(runtime);
  const entered = Promise.withResolvers(), response = Promise.withResolvers();
  t.after(() => response.resolve(answer('low')));
  runtime.state.fetch = () => { entered.resolve(); return response.promise; };
  const pending = runtime.handlers.get('tool_call')(call('git status'), runtime.context);
  await entered.promise;
  await change('allowall');
  assert.equal(runtime.state.notifications.at(-1).type, 'warning');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'decision');
  response.resolve(answer('low'));
  assert.equal(await pending, undefined);
  await change('allowall');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'allowall');
});

test('mode selection rechecks activity after awaiting the picker', async t => {
  const runtime = await setup(t);
  const change = command(runtime);
  runtime.state.picker = () => { runtime.state.idle = false; return 'allowall'; };
  await change('');
  assert.equal(runtime.state.notifications.at(-1).type, 'warning');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'user');
});

test('a background child confirmation blocks switching, including an already open selector', { timeout: 5000 }, async t => {
  const runtime = await setup(t);
  const change = command(runtime);
  const menu = Promise.withResolvers(), choice = Promise.withResolvers();
  const prompt = Promise.withResolvers(), consent = Promise.withResolvers();
  t.after(() => { choice.resolve(undefined); consent.resolve(false); });
  runtime.state.picker = () => { menu.resolve(); return choice.promise; };
  runtime.context.ui.confirm = () => { prompt.resolve(); return consent.promise; };
  const selecting = change('');
  await menu.promise;
  const pending = requestApproval(JSON.parse(process.env[APPROVAL_ENV]), {
    ...call('chmod +x fixture.sh'), childSessionId: 'background', cwd: '/tmp/approval-mode-child',
    purpose: 'ローカルスクリプトの実行権限を変更します。',
  });
  await prompt.promise;
  await change('allowall');
  assert.equal(runtime.state.notifications.at(-1).type, 'warning');
  choice.resolve('allowall');
  await selecting;
  assert.equal(runtime.state.notifications.at(-1).type, 'warning');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'user');
  consent.resolve(false);
  assert.equal((await pending).allowed, false);
  await change('allowall');
  assert.equal(process.env.PI_APPROVAL_REVIEWER, 'allowall');
  assert.equal(runtime.state.requests.length, 0);
});

test('the active mode survives extension reload in the process without session history', async t => {
  const runtime = await setup(t);
  await command(runtime)('allowall');
  await runtime.handlers.get('session_shutdown')({}, runtime.context);
  await assert.rejects(command(runtime)('status'), /not initialized/);
  const reloaded = loadGuard(process.env.PI_APPROVAL_REVIEWER);
  t.after(() => reloaded.handlers.get('session_shutdown')({}, runtime.context));
  await reloaded.handlers.get('session_start')({}, runtime.context);
  await command({ ...reloaded, context: runtime.context })('status');
  assert.match(runtime.state.notifications.at(-1).message, /allowall/);
  assert.equal(runtime.state.requests.length, 0);
});
