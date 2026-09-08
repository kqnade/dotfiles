import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGitHubRemote } from './github.mjs';

const execFile = promisify(execFileCallback);
const CLAUDE_OWNERS = new Set(['livesense-inc', 'jobtalk']);

export async function authorizeRepository({ cwd, env = process.env, signal } = {}) {
  let output;
  try {
    const result = await execFile('git', [
      '-C', cwd, 'config', '--local', '--includes', '--null', '--get-all', 'remote.origin.url',
    ], { env: { ...env, LC_ALL: 'C' }, signal, timeout: 5000, encoding: 'utf8' });
    output = result.stdout;
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return;
    if (error.code === 128 && error.stderr?.trim() === 'fatal: --local can only be used inside a git repository') return;
    throw error;
  }
  for (const url of output.replace(/\0$/u, '').split('\0')) {
    const { owner } = parseGitHubRemote(url);
    if (CLAUDE_OWNERS.has(owner)) {
      throw new Error(`Repository owner ${owner} requires the approved Claude account`);
    }
  }
}
