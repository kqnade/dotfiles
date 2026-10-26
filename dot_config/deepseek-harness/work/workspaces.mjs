import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';

export function apply(ctx) {
  const wrappers = new WeakMap();
  // DSH 0.2.1-rc.2 has no registration hook; API consumers read the registry through Cordis.
  ctx.on('internal/get', (_context, name, _error, next) => {
    const service = next();
    if (name !== 'workspaceRegistry' || !service) return service;
    if (!wrappers.has(service)) {
      wrappers.set(service, new Proxy(service, {
        get(target, property, receiver) {
          if (property === 'create') return async (path, title) => target.create(await authorizeWorkspace(path), title);
          if (property === 'initializeDefault') return async () => undefined;
          return Reflect.get(target, property, receiver);
        },
      }));
    }
    return wrappers.get(service);
  });
  ctx.provide('dotfilesWorkWorkspacePolicy', true);
}

const run = promisify(execFile);
const companyOrigin = /^((ssh|https?|git):\/\/([^/@]+@)?github\.com(:[0-9]+)?\/|([^/@:]+@)?github\.com:)(livesense-inc|jobtalk)\/[^/]+\/?$/i;

export async function authorizeWorkspace(path, environment = process.env) {
  if (!isAbsolute(path)) throw new Error('Workspace path must be absolute.');
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error('Workspace path must be a directory.');
  const env = { ...environment };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[key];
  let origins;
  try {
    const { stdout } = await run('git', ['-C', canonical, 'remote', 'get-url', '--all', 'origin'], {
      env, timeout: 5000, maxBuffer: 1024 * 1024,
    });
    origins = stdout.trim().split('\n');
  } catch (cause) {
    throw new Error('Select a company repository with a readable GitHub origin (livesense-inc or jobtalk).', { cause });
  }
  if (!origins.every(url => companyOrigin.test(url))) {
    throw new Error('Select a company repository: all origin URLs must belong to livesense-inc or jobtalk on GitHub.');
  }
  return canonical;
}
