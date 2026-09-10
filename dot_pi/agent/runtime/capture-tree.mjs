import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandboxEnvironment } from './sandbox-env.mjs';

const helper = fileURLToPath(new URL('./capture-tree.py', import.meta.url));

export function captureTree(options) {
  return capture(options, false);
}

export function captureTopology(options) {
  return capture(options, true);
}

async function capture({ workspace, python, runProcess }, topologyOnly) {
  if (typeof python !== 'string' || !isAbsolute(python)) {
    throw new TypeError('capture Python executable must be absolute');
  }
  const { stdout } = await runProcess({
    command: await realpath(python),
    args: ['-B', '-I', helper, ...(topologyOnly ? ['--topology'] : []), workspace],
    cwd: workspace,
    env: sandboxEnvironment(workspace),
    inheritEnv: false,
    timeoutMs: 30_000,
    maxOutputBytes: 128 * 1024 * 1024,
  });
  return Object.freeze(JSON.parse(stdout).map(record => Object.freeze(record)));
}
