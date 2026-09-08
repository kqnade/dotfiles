import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launch } from './launch.mjs';

export const EXPECTED_VERSION = '0.85.1';

const MANAGED_FLAGS = new Set([
  '--api-key', '--append-system-prompt', '--approve', '--exclude-tools', '--extension', '-e',
  '--mode', '--model', '--models', '--no-approve', '--no-builtin-tools', '--no-extensions',
  '--no-context-files', '--no-prompt-templates', '--no-session', '--no-skills', '--no-themes',
  '--no-tools', '--offline', '--provider', '--prompt-template', '--skill', '--system-prompt',
  '--theme', '--thinking', '--tools', '-a', '-na', '-nbt', '-ne', '-np', '-ns', '-nt',
  '-t', '-xt', '--export', '--list-models', '--tui-mode', '--use-theme', '--verbose',
]);

const VALUE_FLAGS = new Set(['--fork', '--name', '-n', '--session', '--session-dir', '--session-id']);
const VALUE_CANONICAL = new Map([['-n', '--name']]);
const SIMPLE_FLAGS = new Map([
  ['--continue', '--continue'],
  ['-c', '--continue'],
  ['--resume', '--resume'],
  ['-r', '--resume'],
]);

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

const optionName = (arg) => {
  const equals = arg.indexOf('=');
  return equals === -1 ? arg : arg.slice(0, equals);
};

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (value === undefined || value === '--' || value.startsWith('-')) {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
};

export function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('argv must be an array of strings');
  }

  const result = { launchArgs: [] };
  const messages = [];
  let print = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const name = optionName(arg);

    if (arg === '--') {
      messages.push(...argv.slice(index + 1));
      break;
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      result.version = true;
      continue;
    }
    if (arg === '--print' || arg === '-p') {
      if (print) throw new UsageError('print mode may be specified only once');
      print = true;
      continue;
    }
    if (name === '--print' && arg.includes('=')) {
      if (print) throw new UsageError('print mode may be specified only once');
      const prompt = arg.slice(arg.indexOf('=') + 1);
      if (!prompt) throw new UsageError(`${name} requires a prompt`);
      print = true;
      messages.push(prompt);
      continue;
    }
    if (SIMPLE_FLAGS.has(arg)) {
      result.launchArgs.push(SIMPLE_FLAGS.get(arg));
      continue;
    }
    if (VALUE_FLAGS.has(name)) {
      let value;
      if (arg.includes('=')) {
        value = arg.slice(arg.indexOf('=') + 1);
        if (!value || value.startsWith('-')) throw new UsageError(`${name} requires a value`);
      } else {
        value = requireValue(argv, index, name);
        index += 1;
      }
      result.launchArgs.push(VALUE_CANONICAL.get(name) ?? name, value);
      continue;
    }
    if (MANAGED_FLAGS.has(name) || MANAGED_FLAGS.has(arg)) {
      throw new UsageError(`${name} is managed and cannot be overridden`);
    }
    if (print && messages.length === 0 && arg.startsWith('-') && /\s/u.test(arg)) {
      messages.push(arg);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new UsageError(`unsupported option: ${arg}`);
    }
    messages.push(arg);
  }

  if (print) {
    if (messages.length !== 1) throw new UsageError('print mode accepts one prompt');
    result.prompt = messages[0];
  } else if (messages.length > 0) {
    result.launchArgs.push('--', ...messages);
  }

  if (result.help && (result.version || result.prompt !== undefined || result.launchArgs.length > 0)) {
    throw new UsageError('--help cannot be combined with other options');
  }
  if (result.version && (result.prompt !== undefined || result.launchArgs.length > 0)) {
    throw new UsageError('--version cannot be combined with other options');
  }
  return result;
}

export const HELP_TEXT = `Usage: pi [options] [--] [messages...]

Managed Pi coding agent. Sol, tools, extensions, and provider settings are fixed by the launcher.

Options:
  -p, --print <prompt>       Run one non-interactive prompt
  -c, --continue             Continue the most recent session
  -r, --resume               Select a session to resume
      --session <path|id>    Use a specific session
      --session-id <id>      Use an exact session id
      --session-dir <dir>    Use a session directory
      --fork <path|id>       Fork a session
  -n, --name <name>          Set the session display name
      --                    End options and pass messages to interactive Pi
  -h, --help                 Show this help
  -v, --version              Show the installed Pi version
`;

export function packageTarget(env = process.env) {
  const cacheHome = env.XDG_CACHE_HOME || join(env.HOME || '/tmp', '.cache');
  return resolve(env.PI_PACKAGE_TARGET || join(cacheHome, 'pi', 'agent', 'packages'));
}

export function resolvePiEntry(env = process.env) {
  return join(packageTarget(env), 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'bundle', 'cli.js');
}

export function resolveJournalDirectory(env = process.env) {
  const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state');
  return join(resolve(stateHome), 'pi', 'sessions');
}

export function resolveExtensionPath() {
  return resolve(fileURLToPath(new URL('../extensions/managed.ts', import.meta.url)));
}

export function buildLaunchOptions({ env = process.env, cwd = process.cwd(), parsed } = {}) {
  const options = parsed ?? parseArguments([]);
  const packageRoot = packageTarget(env);
  return {
    cwd: resolve(cwd),
    directory: resolveJournalDirectory(env),
    piEntry: resolvePiEntry(env),
    extensionPath: resolveExtensionPath(),
    additionalExtensions: [fileURLToPath(new URL('../extensions/lsp.ts', import.meta.url))],
    env: { ...env, PI_PACKAGE_ROOT: packageRoot },
    capture: false,
    prompt: options.prompt,
    rootArgs: [...options.launchArgs],
  };
}

const signalExitCode = (name) => ({ SIGINT: 130, SIGTERM: 143 }[name] ?? 1);

async function installedVersion(env) {
  const manifest = join(dirname(resolvePiEntry(env)), '..', '..', 'package.json');
  const packageJson = JSON.parse(await readFile(manifest, 'utf8'));
  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error(`Pi package has no valid version: ${manifest}`);
  }
  return packageJson.version;
}

const errorMessages = (error, messages = [], seenMessages = new Set(), seenErrors = new Set()) => {
  if (error === null || error === undefined || seenErrors.has(error)) return messages;
  if (typeof error === 'object' || typeof error === 'function') seenErrors.add(error);

  const message = typeof error === 'string' ? error : error?.message;
  if (typeof message === 'string' && message.length > 0 && !seenMessages.has(message)) {
    seenMessages.add(message);
    messages.push(message);
  }

  if (Array.isArray(error?.errors)) {
    for (const nested of error.errors) errorMessages(nested, messages, seenMessages, seenErrors);
  }
  if (error?.cause !== undefined) errorMessages(error.cause, messages, seenMessages, seenErrors);
  return messages;
};

export function formatError(error) {
  return errorMessages(error).join(': ') || 'unknown error';
}

export async function run(argv = process.argv.slice(2), { env = process.env, cwd = process.cwd(), runLaunch = launch } = {}) {
  const parsed = parseArguments(argv);
  if (parsed.help) {
    process.stdout.write(HELP_TEXT);
    return { code: 0 };
  }
  if (parsed.version) {
    process.stdout.write(`${await installedVersion(env)}\n`);
    return { code: 0 };
  }

  await access(resolvePiEntry(env));
  const version = await installedVersion(env);
  if (version !== EXPECTED_VERSION) {
    throw new Error(`unsupported Pi package version ${version}; expected ${EXPECTED_VERSION}`);
  }
  const controller = new AbortController();
  let receivedSignal;
  const onSignal = (name) => {
    receivedSignal ??= name;
    controller.abort();
  };
  const onInterrupt = () => onSignal('SIGINT');
  const onTerminate = () => onSignal('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  try {
    const result = await runLaunch({ ...buildLaunchOptions({ env, cwd, parsed }), signal: controller.signal });
    if (result?.stderr) process.stderr.write(result.stderr);
    if (receivedSignal) return { ...result, code: signalExitCode(receivedSignal), signal: receivedSignal };
    return { ...result, code: Number.isInteger(result?.code) ? result.code : 1 };
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}

export async function main(argv = process.argv.slice(2), options) {
  try {
    const result = await run(argv, options);
    process.exitCode = result.code;
    return result;
  } catch (error) {
    process.stderr.write(`error: ${formatError(error)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
    return { code: process.exitCode, error };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
