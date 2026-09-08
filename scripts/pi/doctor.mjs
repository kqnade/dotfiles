import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { packageTarget } from '../../dot_pi/agent/runtime/main.mjs';

const execFile = promisify(execFileCallback);
const PI_PACKAGE = '@earendil-works/pi-coding-agent';
const LSP_PACKAGE = 'pi-lsp-adapter';
const REQUIRED_ADAPTER_MODULES = Object.freeze([
  'src/config/loadConfig.ts',
  'src/install/manager.ts',
  'src/install/lockfile.ts',
  'src/lsp/processRegistry.ts',
  'src/lsp/runtimeManager.ts',
  'src/commands/registerCommands.ts',
  'src/tools/registerLspTools.ts',
  'src/tools/registerLspWarmup.ts',
  'src/tools/resultCache.ts',
  'src/statusLine.ts',
]);

const requiredFile = async (path) => {
  try {
    const details = await stat(path);
    if (!details.isFile()) throw new Error('is not a regular file');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing required Pi file: ${path}`);
    throw new Error(`Required Pi file is unavailable: ${path}: ${error.message}`);
  }
};

const requiredJson = async (path, label) => {
  await requiredFile(path);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label}: ${path}: ${error.message}`);
  }
};

const sourceDependency = (manifest, packageName, sourceManifestPath) => {
  const version = manifest.dependencies?.[packageName];
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`Source package manifest does not pin ${packageName}: ${sourceManifestPath}`);
  }
  return version;
};

const validateSourcePackages = async (sourceRoot) => {
  const sourcePackages = join(resolve(sourceRoot), 'dot_pi', 'agent', 'packages');
  const sourceManifestPath = join(sourcePackages, 'package.json');
  const sourceLockPath = join(sourcePackages, 'package-lock.json');
  const manifest = await requiredJson(sourceManifestPath, 'Pi source package manifest');
  const lock = await requiredJson(sourceLockPath, 'Pi source package lock');
  const expected = {
    piVersion: sourceDependency(manifest, PI_PACKAGE, sourceManifestPath),
    adapterVersion: sourceDependency(manifest, LSP_PACKAGE, sourceManifestPath),
  };
  const lockedDependencies = lock.packages?.['']?.dependencies;
  if (!lockedDependencies || typeof lockedDependencies !== 'object') {
    throw new Error(`Pi source lock has no root dependencies: ${sourceLockPath}`);
  }
  for (const [packageName, version] of Object.entries({
    [PI_PACKAGE]: expected.piVersion,
    [LSP_PACKAGE]: expected.adapterVersion,
  })) {
    if (lockedDependencies[packageName] !== version) {
      throw new Error(
        `Pi source lock mismatch for ${packageName}: package.json pins ${version}, `
        + `package-lock.json pins ${lockedDependencies[packageName] ?? '<missing>'}`,
      );
    }
    const lockedPackage = lock.packages?.[`node_modules/${packageName}`];
    if (lockedPackage?.version !== version) {
      throw new Error(
        `Pi source lock mismatch for ${packageName}: expected ${version}, `
        + `lock entry has ${lockedPackage?.version ?? '<missing>'}`,
      );
    }
  }
  return { sourcePackages, ...expected };
};

const validateInstalledPackages = async ({ packageTarget: target, sourcePackages, piVersion, adapterVersion }) => {
  const piRoot = join(target, 'node_modules', ...PI_PACKAGE.split('/'));
  const adapterRoot = join(target, 'node_modules', LSP_PACKAGE);
  const piManifestPath = join(piRoot, 'package.json');
  const adapterManifestPath = join(adapterRoot, 'package.json');
  const piManifest = await requiredJson(piManifestPath, 'installed Pi package manifest');
  const adapterManifest = await requiredJson(adapterManifestPath, 'installed LSP adapter manifest');

  if (piManifest.version !== piVersion) {
    throw new Error(
      `Pi package version mismatch: expected ${piVersion} from ${sourcePackages}, installed `
      + `${piManifest.version ?? '<missing>'} at ${piManifestPath}`,
    );
  }
  if (adapterManifest.version !== adapterVersion) {
    throw new Error(
      `LSP adapter version mismatch: expected ${adapterVersion} from ${sourcePackages}, installed `
      + `${adapterManifest.version ?? '<missing>'} at ${adapterManifestPath}`,
    );
  }

  await requiredFile(join(piRoot, 'dist', 'bundle', 'cli.js'));
  for (const modulePath of REQUIRED_ADAPTER_MODULES) {
    await requiredFile(join(adapterRoot, modulePath));
  }
  return { piVersion, adapterVersion };
};

const requiredExecutable = async (path, label) => {
  await requiredFile(path).catch((error) => {
    throw new Error(`${label} is invalid: ${error.message}`);
  });
  try {
    await access(path, constants.X_OK);
  } catch (error) {
    throw new Error(`${label} is not executable: ${path}: ${error.message}`);
  }
};

const validateWrappers = async ({ home, packageTarget: target, expectedVersion, env }) => {
  const managedWrapper = join(resolve(home || homedir()), '.local', 'bin', 'pi');
  const piWrapper = join(resolve(home || homedir()), '.pi', 'bin', 'pi');
  await requiredExecutable(managedWrapper, 'Managed Pi wrapper');
  await requiredExecutable(piWrapper, 'Pi home wrapper');

  const managedPath = await realpath(managedWrapper);
  const piPath = await realpath(piWrapper);
  if (managedPath !== piPath) {
    throw new Error(
      `Pi wrapper paths do not resolve to the same managed wrapper: `
      + `${managedWrapper} -> ${managedPath}; ${piWrapper} -> ${piPath}`,
    );
  }

  let result;
  try {
    result = await execFile(managedWrapper, ['--version'], {
      env: { ...env, PI_PACKAGE_TARGET: target },
      encoding: 'utf8',
      timeout: 10000,
    });
  } catch (error) {
    const details = error.stderr?.trim() || error.message;
    throw new Error(`Managed Pi wrapper version check failed: ${managedWrapper}: ${details}`);
  }
  const wrapperVersion = result.stdout.trim();
  if (wrapperVersion !== expectedVersion) {
    throw new Error(
      `Managed Pi wrapper version mismatch: expected ${expectedVersion}, installed ${wrapperVersion || '<empty>'}`,
    );
  }
  return wrapperVersion;
};

export async function checkPiInstallation({ sourceRoot, env = process.env } = {}) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new TypeError('sourceRoot is required');
  }
  const packages = await validateSourcePackages(sourceRoot);
  const target = packageTarget(env);
  const installed = await validateInstalledPackages({ packageTarget: target, ...packages });
  const wrapperVersion = await validateWrappers({
    home: env.HOME || homedir(),
    packageTarget: target,
    expectedVersion: packages.piVersion,
    env,
  });
  return Object.freeze({ packageTarget: target, ...installed, wrapperVersion });
}

export function parseArguments(argv) {
  if (!Array.isArray(argv)) throw new TypeError('argv must be an array');
  let sourceRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--source') {
      sourceRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('--source=')) {
      sourceRoot = argument.slice('--source='.length);
      continue;
    }
    if (argument === '--help' || argument === '-h') return { help: true };
    throw new Error(`unsupported option: ${argument}`);
  }
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('--source is required');
  }
  return { sourceRoot: resolve(sourceRoot) };
}

export async function main(argv = process.argv.slice(2), { env = process.env } = {}) {
  try {
    const parsed = parseArguments(argv);
    if (parsed.help) {
      process.stdout.write('Usage: pi-doctor --source <dotfiles-root>\n');
      return { code: 0 };
    }
    return { code: 0, result: await checkPiInstallation({ sourceRoot: parsed.sourceRoot, env }) };
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return { code: 1, error };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main();
  process.exitCode = result.code;
}
