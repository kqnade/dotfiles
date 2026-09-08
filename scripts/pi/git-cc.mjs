import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { EXPECTED_VERSION, formatError, packageTarget, resolvePiEntry } from '../../dot_pi/agent/runtime/main.mjs';
import { dispatchCommitMessage, parseGitHubRemote } from './commit-message.mjs';

const execFileAsync = promisify(execFile);

const gitCommand = async (args, options) => {
  const { stdout } = await execFileAsync('git', args, { ...options, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

const generateMessage = async ({ route, stagedDiff, recentLog, cwd, env, signal }) => {
  const backends = await import('./commit-backends.mjs');
  const options = { cwd, stagedDiff, recentLog, env, signal };
  if (route.backend === 'claude') return backends.generateClaudeCommitMessage(options);
  if (route.backend !== 'pi') throw new Error(`Unsupported commit backend: ${route.backend}`);
  const manifest = join(packageTarget(env), 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json');
  const { version } = JSON.parse(await readFile(manifest, 'utf8'));
  if (version !== EXPECTED_VERSION) throw new Error(`Pi ${EXPECTED_VERSION} is required; installed version is ${version}`);
  return backends.generatePiCommitMessage({ ...options, piEntry: resolvePiEntry(env) });
};

export async function commitStagedChanges({
  cwd = process.cwd(), env = process.env, signal, runGit = gitCommand, generate = generateMessage,
} = {}) {
  signal?.throwIfAborted();
  const git = args => runGit(args, { cwd, env, signal });
  const readRemote = () => git(['config', '--get', 'remote.origin.url']);
  const readResolvedRemote = () => git(['remote', 'get-url', '--all', 'origin']);
  const readDiff = () => git(['diff', '--cached', '--no-ext-diff', '--no-textconv']);
  const remote = await readRemote();
  const configuredRepository = parseGitHubRemote(remote.replace(/\r?\n$/u, ''));
  const resolvedRemote = await readResolvedRemote();
  for (const url of resolvedRemote.replace(/\r?\n$/u, '').split(/\r?\n/u)) {
    const repository = parseGitHubRemote(url);
    if (repository.owner !== configuredRepository.owner
      || repository.repository.toLowerCase() !== configuredRepository.repository.toLowerCase()) {
      throw new Error('Git URL rewriting changes the repository identity');
    }
  }
  let stagedDiff;
  const message = await dispatchCommitMessage({
    remoteUrl: remote.replace(/\r?\n$/u, ''),
    readStagedDiff: async () => {
      stagedDiff = await readDiff();
      if (!stagedDiff.trim()) throw new Error("No staged changes. Run 'git add' first.");
      return stagedDiff;
    },
    readRecentLog: () => git(['log', '--oneline', '-50']),
    generate: data => generate({ ...data, cwd, env, signal }),
  });
  signal?.throwIfAborted();
  if (await readRemote() !== remote || await readResolvedRemote() !== resolvedRemote) {
    throw new Error('Repository remote changed during message generation');
  }
  if (await readDiff() !== stagedDiff) throw new Error('Staged changes changed during message generation');
  const output = await git(['commit', '-m', message]);
  return { message, output };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 0) throw new Error('Usage: git cc');
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Commit message generation interrupted'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    process.stderr.write('Generating commit message...\n');
    const { message, output } = await commitStagedChanges({ signal: controller.signal });
    process.stdout.write(`Message: ${message}\n${output}`);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`error: ${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
