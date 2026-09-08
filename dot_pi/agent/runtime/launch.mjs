import { spawn } from 'node:child_process';
import { startBroker } from './broker.mjs';
import { modelFor } from './models.mjs';
import { stopProcessGroup } from './ownership.mjs';
import { defaultSkillsRoot, resolveSkillResources } from './skills.mjs';

export async function launch({
  cwd, directory, piEntry, extensionPath, env = process.env, capture = false,
  prompt, signal, rootArgs = [], additionalExtensions = [], skillsRoot,
}) {
  signal?.throwIfAborted();
  if (prompt !== undefined && typeof prompt !== 'string') throw new TypeError('prompt must be a string');
  if (!Array.isArray(rootArgs) || rootArgs.some(arg => typeof arg !== 'string')) throw new TypeError('rootArgs must be strings');
  if (!Array.isArray(additionalExtensions) || additionalExtensions.some(path => typeof path !== 'string')) {
    throw new TypeError('additionalExtensions must be paths');
  }
  const skills = await resolveSkillResources({ skillsRoot: skillsRoot ?? defaultSkillsRoot(env) });
  const model = modelFor('root');
  const common = [piEntry, '--no-extensions', '--no-builtin-tools', '--no-skills',
    ...skills.skillPaths.flatMap(path => ['--skill', path]),
    '--no-prompt-templates', '--no-approve', '--offline', '-e', extensionPath,
    ...additionalExtensions.flatMap(path => ['-e', path])];
  const broker = await startBroker({
    cwd, directory, command: process.execPath, skillResources: skills.resourcePaths,
    args: [...common, '--mode', 'rpc', '--no-session'], env, externalRoot: true,
  });
  let root;
  let result;
  const errors = [];
  const abort = () => { void root.close().catch(error => { errors.push(error); }); };
  try {
    const { socketPath, agentId, token } = broker.connection;
    const child = spawn(process.execPath, [...common, '--provider', model.provider,
      '--model', model.id, '--thinking', model.effort, ...rootArgs,
      ...(prompt === undefined ? [] : ['--print', '--', prompt])], {
      cwd, detached: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: { ...env, PI_BROKER_SOCKET: socketPath, PI_AGENT_ID: agentId,
        PI_AGENT_TOKEN: token, PI_AGENT_ROLE: 'root' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    let spawnError;
    child.once('error', error => { spawnError = error; });
    const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    let closing;
    root = {
      process: child,
      close() {
        closing ??= (async () => {
          if (child.pid !== undefined) await stopProcessGroup(child.pid, 1000);
          await exited;
        })();
        return closing;
      },
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    if (child.pid === undefined) {
      await exited;
      throw spawnError ?? new Error('Pi root did not start');
    }
    await broker.registerRoot(root);
    result = { ...await exited, stdout, stderr };
    if (spawnError) throw spawnError;
  } catch (error) {
    errors.push(error);
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await root?.close(); } catch (error) { errors.push(error); }
    try { await broker.close(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Pi launch failed');
  return result;
}
