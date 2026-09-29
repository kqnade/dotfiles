import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const guard = fileURLToPath(new URL('../../dot_pi/agent/extensions/execution-guard.ts', import.meta.url));
const channel = new URL('../../dot_pi/agent/extensions/lib/approval-channel.mjs', import.meta.url).href;

test('native Pi RPC forwards child approval to real UI requests without model calls', { timeout: 30000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'pi-rpc-approval-'));
  const agentDir = join(temporary, 'agent');
  await mkdir(agentDir);
  const fixture = join(temporary, 'probe.mjs');
  const client = `
    import {requestApproval, APPROVAL_ENV} from ${JSON.stringify(channel)};
    const decision = await requestApproval(JSON.parse(process.env[APPROVAL_ENV]), {
      toolName:'bash', toolCallId:'rpc-probe', childSessionId:'rpc-child',
      cwd:process.cwd(), input:{command:'printf test'}, purpose:'承認経路を確認するためのテストです。',
    });
    console.log(JSON.stringify(decision));
  `;
  await writeFile(fixture, `
    import {execFile} from 'node:child_process';
    import {promisify} from 'node:util';
    import {APPROVAL_ENV} from ${JSON.stringify(channel)};
    export default function(pi) {
      pi.registerCommand('approval-probe', {
        description:'Offline approval test',
        handler: async () => {
          const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module','-e',${JSON.stringify(client)}]);
          pi.sendMessage({customType:'approval_probe', content:'Approval test result', display:false,
            details:{...JSON.parse(stdout), socketPath:JSON.parse(process.env[APPROVAL_ENV]).socketPath}}, {triggerTurn:false});
        },
      });
    }
  `);
  const executable = execFileSync('mise', ['which', 'pi'], { encoding: 'utf8' }).trim();
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, HOME: temporary };
  delete env.PI_EXECUTION_GUARD;
  delete env.PI_EXECUTION_APPROVAL_CHANNEL;
  const child = spawn(executable, [
    '--mode', 'rpc', '--offline', '--no-session', '--no-tools', '--no-skills',
    '--no-prompt-templates', '--no-context-files', '--no-extensions',
    '--extension', guard, '--extension', fixture,
  ], { cwd: temporary, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const events = [];
  const waiting = [];
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const event = JSON.parse(line);
    const index = waiting.findIndex(item => item.match(event));
    if (index >= 0) waiting.splice(index, 1)[0].resolve(event);
    else events.push(event);
  });
  const next = match => {
    const index = events.findIndex(match);
    if (index >= 0) return Promise.resolve(events.splice(index, 1)[0]);
    return new Promise((resolve, reject) => waiting.push({ match, resolve, reject }));
  };
  const exited = new Promise(resolve => child.once('exit', code => {
    for (const item of waiting.splice(0)) item.reject(new Error(`Pi exited ${code}: ${stderr}`));
    resolve(code);
  }));
  const deadline = setTimeout(() => child.kill('SIGTERM'), 20000);
  t.after(async () => {
    clearTimeout(deadline);
    if (child.exitCode === null) { child.kill('SIGTERM'); await exited; }
    lines.close();
    await rm(temporary, { recursive: true, force: true });
  });
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  send({ id: 'commands', type: 'get_commands' });
  const commands = await next(e => e.id === 'commands' && e.type === 'response');
  assert.equal(commands.success, true);
  assert.ok(commands.data.commands.some(command => command.name === 'approval-probe' && command.source === 'extension'));
  let socketPath;
  for (const response of [{ confirmed: true }, { confirmed: false }, { cancelled: true }]) {
    send({ id: 'probe', type: 'prompt', message: '/approval-probe' });
    const dialog = await next(e => e.type === 'extension_ui_request' && e.method === 'confirm');
    assert.match(dialog.message, /子session: rpc-child/);
    assert.match(dialog.message, /コマンド \(command\) \[文字列\]:\n  printf test/);
    assert.match(dialog.message, /目的（agentの説明・参考）:\n  承認経路を確認するためのテストです/);
    send({ type: 'extension_ui_response', id: dialog.id, ...response });
    const result = (await next(e => e.type === 'message_end' && e.message?.customType === 'approval_probe')).message.details;
    assert.equal(result.allowed, response.confirmed === true);
    socketPath = result.socketPath;
    assert.equal((await next(e => e.id === 'probe' && e.type === 'response')).success, true);
  }
  assert.equal(events.some(event => event.type === 'agent_start'), false);
  assert.equal(events.some(event => event.type === 'extension_error'), false);
  child.stdin.end();
  assert.equal(await exited, 0, stderr);
  await assert.rejects(stat(dirname(socketPath)), { code: 'ENOENT' });
});
