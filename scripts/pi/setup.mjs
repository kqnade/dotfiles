import { cp, lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NPM_ARGS = Object.freeze(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed (${code ?? signal})`));
    });
  });
}

async function replaceDirectory(staging, target) {
  const backup = `${target}.previous-${process.pid}-${Date.now()}`;
  let hadTarget = false;
  try {
    hadTarget = true;
    if (!(await lstat(target)).isDirectory()) {
      throw new Error(`package target must be a directory: ${target}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    hadTarget = false;
  }

  let movedTarget = false;
  if (hadTarget) {
    await rename(target, backup);
    movedTarget = true;
  }

  try {
    await rename(staging, target);
  } catch (error) {
    if (movedTarget) {
      try {
        await rename(backup, target);
        movedTarget = false;
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `failed to publish package target and restore ${target}`,
        );
      }
    }
    throw error;
  }

  if (movedTarget) await rm(backup, { recursive: true, force: true });
}

export async function prepare({
  packageSource,
  packageTarget,
  npmCommand = 'npm',
  run = runCommand,
} = {}) {
  if (!packageSource || !packageTarget) {
    throw new TypeError('packageSource and packageTarget are required');
  }

  const source = resolve(packageSource);
  const target = resolve(packageTarget);
  if (isInside(source, target)) {
    throw new Error('packageTarget must be outside packageSource');
  }

  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), `.${basename(target)}.staging-`));
  try {
    await cp(join(source, 'package.json'), join(staging, 'package.json'));
    await cp(join(source, 'package-lock.json'), join(staging, 'package-lock.json'));
    const result = await run(npmCommand, [...NPM_ARGS], { cwd: staging });
    if (typeof result === 'number' && result !== 0) {
      throw new Error(`${npmCommand} exited with status ${result}`);
    }
    if (result && typeof result.status === 'number' && result.status !== 0) {
      throw new Error(`${npmCommand} exited with status ${result.status}`);
    }
    await replaceDirectory(staging, target);
    return { packageSource: source, target, npmCommand, npmArgs: [...NPM_ARGS] };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function defaultPaths() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const cache = process.env.XDG_CACHE_HOME || join(process.env.HOME || '/tmp', '.cache');
  return {
    packageSource: resolve(root, 'dot_pi/agent/packages'),
    packageTarget: join(cache, 'pi/agent/packages'),
  };
}

async function main() {
  const paths = defaultPaths();
  await prepare({
    packageSource: process.env.PI_PACKAGE_SOURCE || paths.packageSource,
    packageTarget: process.env.PI_PACKAGE_TARGET || paths.packageTarget,
    npmCommand: process.env.PI_NPM_COMMAND || 'npm',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
}
