import { access, chmod, copyFile, mkdir, mkdtemp, open, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  delimiter,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { readFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { runStagedProcess } from './staged-process.mjs';
import { copyRuntimeTree } from './staging.mjs';
import { resolveRustfmt } from './rustup.mjs';
import { cargoEdition } from './cargo-edition.mjs';

function nodeModulesRoot(executable) {
  let root;
  for (let directory = dirname(executable); directory !== dirname(directory); directory = dirname(directory)) {
    if (basename(directory) === 'node_modules') root = directory;
  }
  return root;
}

async function stageRustfmtRuntime(executable, workspace) {
  if (basename(executable) !== 'rustfmt' || basename(dirname(executable)) !== 'bin') return executable;
  const libraries = join(dirname(dirname(executable)), 'lib');
  try {
    if (!(await stat(libraries)).isDirectory()) return executable;
  } catch (error) {
    if (error.code === 'ENOENT') return executable;
    throw error;
  }
  const runtime = await mkdtemp(join(workspace, '.pi-rustfmt-runtime-'));
  await mkdir(join(runtime, 'bin'), { mode: 0o700 });
  await mkdir(join(runtime, 'lib'), { mode: 0o700 });
  await copyRuntimeTree(libraries, join(runtime, 'lib'));
  const command = join(runtime, 'bin', 'rustfmt');
  await copyFile(executable, command);
  await chmod(command, 0o700);
  return command;
}

async function formatterInvocation(command, args) {
  const executable = await realpath(command);
  const handle = await open(executable, 'r');
  let header;
  try {
    const buffer = Buffer.alloc(256);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    header = buffer.subarray(0, bytesRead).toString('utf8').split('\n')[0];
  } finally { await handle.close(); }
  if (/^#!\s*(?:\/usr\/bin\/env\s+node|\/\S*\/node)\s*$/u.test(header)) {
    return { command: process.execPath, args: [executable, ...args], readPaths: [executable] };
  }
  return { command: executable, args };
}

const isWithin = (root, candidate) => {
  const distance = relative(root, candidate);
  return distance === '' || (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance));
};

const assertType = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
};

const makeError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const hasBinary = async (directory, name) => {
  const suffixes = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.com'] : [''];
  for (const suffix of suffixes) {
    try {
      await access(join(directory, `${name}${suffix}`));
      return join(directory, `${name}${suffix}`);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        throw error;
      }
    }
  }
  return undefined;
};

const hasConfig = async (cwd, names) => {
  for (const name of names) {
    try {
      await readFile(join(cwd, name), 'utf8');
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return false;
};

const hasNamedConfig = async (scopeRoot, startDirectory, names) => {
  let candidate = startDirectory;
  while (isWithin(scopeRoot, candidate)) {
    if (await hasConfig(candidate, names)) {
      return true;
    }
    if (candidate === scopeRoot) {
      break;
    }
    candidate = dirname(candidate);
  }
  return false;
};

async function rustfmtConfig(scopeRoot, filePath) {
  for (let directory = dirname(filePath); isWithin(scopeRoot, directory); directory = dirname(directory)) {
    for (const name of ['.rustfmt.toml', 'rustfmt.toml']) {
      if (await hasConfig(directory, [name])) return join(directory, name);
    }
    if (directory === scopeRoot) break;
  }
  return undefined;
}

const hasPackageConfig = async (path, predicate) => {
  const text = await readFile(join(path, 'package.json'), 'utf8');
  const data = JSON.parse(text);
  return predicate(data);
};

const hasPrettierConfig = async (scopeRoot, startDirectory) => {
  if (await hasNamedConfig(scopeRoot, startDirectory, [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    '.prettierrc.toml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs',
    'prettier.config.json',
    'prettier.config.toml',
  ])) {
    return true;
  }

  let candidate = startDirectory;
  while (isWithin(scopeRoot, candidate)) {
    try {
      if (await hasPackageConfig(candidate, (value) => (
        value && typeof value === 'object' && value.prettier !== undefined
      ))) {
        return true;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (candidate === scopeRoot) {
      break;
    }
    candidate = dirname(candidate);
  }

  return false;
};

const hasBiomeConfig = async (scopeRoot, startDirectory) => {
  return hasNamedConfig(scopeRoot, startDirectory, ['biome.json', 'biome.jsonc']);
};

const hasRuffConfig = async (scopeRoot, startDirectory) => {
  if (await hasNamedConfig(scopeRoot, startDirectory, ['ruff.toml', '.ruff.toml'])) {
    return true;
  }

  let candidate = startDirectory;
  while (isWithin(scopeRoot, candidate)) {
    try {
      const text = await readFile(join(candidate, 'pyproject.toml'), 'utf8');
      if (/\[tool\.ruff(?:\.[^\]]+)?\]/.test(text)) {
        return true;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    if (candidate === scopeRoot) {
      break;
    }
    candidate = dirname(candidate);
  }

  return false;
};

const resolveBinary = async (scopeRoot, startDirectory, name) => {
  let candidate = startDirectory;
  while (isWithin(scopeRoot, candidate)) {
    const nodeModulesBin = await hasBinary(join(candidate, 'node_modules', '.bin'), name);
    if (nodeModulesBin !== undefined) {
      return nodeModulesBin;
    }
    if (candidate === scopeRoot) {
      break;
    }
    candidate = dirname(candidate);
  }

  const pathEntries = process.env.PATH ? process.env.PATH.split(delimiter) : [];
  for (const dir of pathEntries) {
    if (!dir) {
      continue;
    }
    const found = await hasBinary(dir, name);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
};

const selectFormatter = async (scopeRoot, filePath) => {
  const extension = extname(filePath).toLowerCase();
  const directory = dirname(filePath);

  if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'].includes(extension)) {
    if (await hasBiomeConfig(scopeRoot, directory)) {
      const command = await resolveBinary(scopeRoot, directory, 'biome');
      if (command === undefined) {
        throw makeError('biome is configured but unavailable', 'FORMATTER_MISSING');
      }
      return { command, args: ['format', '--stdin-file-path', filePath] };
    }

    if (!await hasPrettierConfig(scopeRoot, directory)) {
      return { skipped: true, reason: 'missing_js_formatter_config' };
    }

    const command = await resolveBinary(scopeRoot, directory, 'prettier');
    if (command === undefined) {
      throw makeError('prettier is configured but unavailable', 'FORMATTER_MISSING');
    }
    return { command, args: ['--stdin-filepath', filePath] };
  }

  if (extension === '.py') {
    if (!await hasRuffConfig(scopeRoot, directory)) {
      return { skipped: true, reason: 'missing_python_formatter_config' };
    }

    const command = await resolveBinary(scopeRoot, directory, 'ruff');
    if (command === undefined) {
      throw makeError('ruff is configured but unavailable', 'FORMATTER_MISSING');
    }
    return { command, args: ['format', '--stdin-filename', filePath, '-'] };
  }

  if (extension === '.go') {
    const command = await resolveBinary(scopeRoot, directory, 'gofmt');
    if (command === undefined) {
      throw makeError('gofmt is unavailable', 'FORMATTER_MISSING');
    }
    return { command, args: [] };
  }

  if (extension === '.rs') {
    const command = await resolveBinary(scopeRoot, directory, 'rustfmt');
    if (command === undefined) {
      throw makeError('rustfmt is unavailable', 'FORMATTER_MISSING');
    }
    return { command, args: ['--emit', 'stdout'], runtime: 'rustfmt' };
  }

  return { skipped: true, reason: 'formatter_not_configured_for_file_type' };
};

export async function formatFile({ ownership, lease, path: targetPath, cwd, signal } = {}, runStaged = runStagedProcess) {
  assertType(targetPath, 'path');
  if (!ownership || typeof ownership.run !== 'function') {
    throw new TypeError('ownership must be provided');
  }
  if (!lease || typeof lease !== 'object') {
    throw new TypeError('lease must be provided');
  }
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new TypeError('cwd must be a non-empty string');
  }

  return ownership.run(lease, async () => {
    const lexical = isAbsolute(targetPath) ? resolve(targetPath) : resolve(cwd, targetPath);
    const canonical = await realpath(lexical);
    const scope = await realpath(cwd);
    if (!lease.paths || !lease.paths.some((root) => isWithin(root, canonical))) {
      throw makeError(`target is outside ownership scope: ${targetPath}`, 'OUT_OF_SCOPE');
    }

    const formatter = await selectFormatter(scope, canonical);
    if (formatter.skipped) {
      return { status: 'skipped', path: targetPath, reason: formatter.reason };
    }
    let executable = await realpath(formatter.command);
    if (formatter.runtime === 'rustfmt' && basename(executable) === 'rustup') {
      executable = await resolveRustfmt({ ownership, lease, cwd: scope, path: canonical, command: executable, signal }, runStaged);
    }

    const result = await runStaged({
      ownership,
      lease,
      cwd: scope,
      files: [relative(scope, canonical)],
      includeProjectFiles: true,
      signal,
      prepare: async area => {
        const target = area.files.find(file => file.originalPath === canonical);
        const args = formatter.args.map(arg => arg === canonical ? target.stagedPath : arg);
        if (formatter.runtime === 'rustfmt') {
          const config = await rustfmtConfig(area.workspace, target.stagedPath);
          if (config) args.push('--config-path', config);
          const edition = await cargoEdition(area.workspace, target.stagedPath);
          if (edition) args.push('--edition', edition);
        }
        let command = isWithin(scope, executable) ? join(area.workspace, relative(scope, executable)) : executable;
        const packageRoot = nodeModulesRoot(executable);
        if (!isWithin(scope, executable) && packageRoot) {
          const runtime = await mkdtemp(join(area.workspace, '.pi-format-runtime-'));
          const packages = join(runtime, 'node_modules');
          await mkdir(packages, { mode: 0o700 });
          await copyRuntimeTree(packageRoot, packages);
          command = join(packages, relative(packageRoot, executable));
        } else if (!isWithin(scope, executable) && formatter.runtime === 'rustfmt') {
          command = await stageRustfmtRuntime(executable, area.workspace);
        }
        return {
          ...await formatterInvocation(command, args),
          stdin: await readFile(target.stagedPath, 'utf8'),
        };
      },
    });

    if (signal?.aborted) throw makeError('formatter was aborted before publication', 'ABORT_ERR');
    const expectedHash = result.files.find(file => file.originalPath === canonical).hash;
    const { hash } = await ownership.write(lease, targetPath, result.stdout, { expectedHash });
    return {
      status: hash === expectedHash ? 'unchanged' : 'formatted',
      path: targetPath,
      hash,
    };
  });
}
