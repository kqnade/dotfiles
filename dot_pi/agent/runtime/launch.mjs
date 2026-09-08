import { spawn } from 'node:child_process';
import { startBroker } from './broker.mjs';
import { modelFor } from './models.mjs';
import { stopProcessGroup } from './ownership.mjs';

export async function launch({ cwd, directory, piEntry, extensionPath, env = process.env, capture = false }) {
  const model = modelFor('root');
  const common = [piEntry, '--no-extensions', '--no-builtin-tools', '--no-skills',
    '--no-prompt-templates', '--no-approve', '--offline', '-e', extensionPath];
  const broker = await startBroker({
    cwd, directory, command: process.execPath,
    args: [...common, '--mode', 'rpc', '--no-session'], env, externalRoot: true,
  });
  let root;
  let result;
  const errors = [];
  try {
    const { socketPath, agentId, token } = broker.connection;
    const child = spawn(process.execPath, [...common, '--provider', model.provider,
      '--model', model.id, '--thinking', model.effort], {
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
    try { await root?.close(); } catch (error) { errors.push(error); }
    try { await broker.close(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Pi launch failed');
  return result;
}
