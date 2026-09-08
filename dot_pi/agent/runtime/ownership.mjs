import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  lstat,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  lstatSync,
  realpathSync,
} from 'node:fs';

const leases = new WeakMap();
const writerContext = new AsyncLocalStorage();

const isWithin = (root, candidate) => {
  const distance = relative(root, candidate);
  return distance === '' ||
    (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance));
};

const pathFromCwd = (cwd, value) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('path must be a non-empty string');
  }
  const candidate = isAbsolute(value) ? resolve(value) : resolve(cwd, value);
  if (!isWithin(cwd, candidate)) {
    throw new Error(`path is outside ownership cwd: ${value}`);
  }
  return candidate;
};

const canonicalExistingPath = (cwd, value) => {
  const candidate = pathFromCwd(cwd, value);
  try {
    return realpathSync(candidate);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    const missing = [];
    let parent = candidate;
    while (true) {
      try {
        const canonicalParent = realpathSync(parent);
        return join(canonicalParent, ...missing.reverse());
      } catch (parentError) {
        if (parentError.code !== 'ENOENT' || parent === cwd) {
          throw parentError;
        }
        missing.push(parent.split(sep).pop());
        parent = dirname(parent);
      }
    }
  }
};

const makeLease = (state, owner, generation) => {
  const lease = Object.freeze({
    owner,
    generation,
    paths: Object.freeze([...state.paths]),
  });
  leases.set(lease, state);
  return lease;
};

const errorWithCode = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const digest = (text) => createHash('sha256').update(text).digest('hex');

const normalizedHash = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new TypeError('expectedHash must be a SHA-256 string');
  }
  const hash = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new TypeError('expectedHash must be a SHA-256 string');
  }
  return hash.toLowerCase();
};

export const sha256 = digest;

export class Ownership {
  #state;

  constructor({ cwd } = {}) {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      throw new TypeError('cwd is required');
    }
    const canonicalCwd = realpathSync(resolve(cwd));
    if (!lstatSync(canonicalCwd).isDirectory()) {
      throw new Error('cwd must be a directory');
    }
    this.#state = {
      cwd: canonicalCwd,
      currentLease: null,
      generation: 0,
      paths: [],
      active: new Set(),
      draining: false,
      drainPromise: null,
      drained: false,
      quarantined: null,
    };
  }

  claim(owner, paths) {
    if (typeof owner !== 'string' || owner.length === 0) {
      throw new TypeError('owner must be a non-empty string');
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new TypeError('paths must be a non-empty array');
    }
    const state = this.#state;
    if (state.currentLease !== null || state.quarantined !== null) {
      throw errorWithCode('ownership has already been claimed', 'OWNERSHIP_CLAIMED');
    }

    const canonicalPaths = [...new Set(paths.map((value) => canonicalExistingPath(state.cwd, value)))];
    for (const path of canonicalPaths) {
      if (!isWithin(state.cwd, path)) {
        throw errorWithCode(`claim is outside ownership cwd: ${path}`, 'OUT_OF_SCOPE');
      }
    }

    state.paths = canonicalPaths;
    state.generation = 1;
    state.currentLease = makeLease(state, owner, state.generation);
    return state.currentLease;
  }

  #assertLease(lease) {
    const state = leases.get(lease);
    if (state !== this.#state || state.currentLease !== lease) {
      throw errorWithCode('lease is not current', 'STALE_LEASE');
    }
    if (state.quarantined !== null) {
      throw errorWithCode(`ownership is quarantined: ${state.quarantined}`, 'QUARANTINED');
    }
    return state;
  }

  #assertWritable(lease) {
    const state = this.#assertLease(lease);
    if (state.draining) {
      throw errorWithCode('ownership is draining', 'DRAINING');
    }
    const context = writerContext.getStore();
    if (!context || context.state !== state || context.lease !== lease || !context.active) {
      throw errorWithCode('write requires an active ownership run', 'NO_ACTIVE_RUN');
    }
    return state;
  }

  async run(lease, operation) {
    const state = this.#assertLease(lease);
    if (state.draining) {
      throw errorWithCode('ownership is draining', 'DRAINING');
    }
    if (typeof operation !== 'function') {
      throw new TypeError('operation must be a function');
    }

    const context = { state, lease, active: true };
    let tracked;
    tracked = Promise.resolve()
      .then(() => writerContext.run(context, () => operation(lease)))
      .finally(() => {
        context.active = false;
        state.active.delete(tracked);
      });
    state.active.add(tracked);
    return tracked;
  }

  async drain(lease) {
    const state = this.#assertLease(lease);
    if (state.drainPromise !== null) {
      return state.drainPromise;
    }
    state.draining = true;
    const pending = [...state.active];
    state.drainPromise = Promise.allSettled(pending).then(() => {
      state.drained = state.active.size === 0;
      return state.drained;
    });
    return state.drainPromise;
  }

  async transfer(lease, newOwner) {
    const state = this.#assertLease(lease);
    if (typeof newOwner !== 'string' || newOwner.length === 0) {
      throw new TypeError('newOwner must be a non-empty string');
    }
    if (!state.draining || !state.drained || state.active.size !== 0) {
      throw errorWithCode('ownership has not been confirmed drained', 'NOT_DRAINED');
    }

    const snapshots = await snapshotScope(state);
    this.#assertLease(lease);
    if (!state.draining || !state.drained || state.active.size !== 0) {
      throw errorWithCode('ownership changed while taking snapshots', 'NOT_DRAINED');
    }

    state.generation += 1;
    const nextLease = makeLease(state, newOwner, state.generation);
    state.currentLease = nextLease;
    state.draining = false;
    state.drainPromise = null;
    state.drained = false;
    return { lease: nextLease, snapshots };
  }

  async write(lease, path, text, { expectedHash } = {}) {
    const state = this.#assertWritable(lease);
    if (typeof text !== 'string' && !Buffer.isBuffer(text)) {
      throw new TypeError('text must be a string or Buffer');
    }

    const lexicalTarget = pathFromCwd(state.cwd, path);
    const expected = normalizedHash(expectedHash);
    const initial = await inspectTarget(state, lexicalTarget, path);
    const target = initial.canonical;
    const existing = initial.stats;
    if (expected !== undefined) {
      const before = await readPreimage(lexicalTarget);
      const actual = before === null ? null : digest(before);
      if (actual !== expected) {
        throw errorWithCode(`preimage hash mismatch for ${path}`, 'PREIMAGE_MISMATCH');
      }
    }

    const parent = dirname(lexicalTarget);
    const temporary = join(parent, `.${lexicalTarget.split(sep).pop()}.pi-${process.pid}-${randomUUID()}.tmp`);
    let handle;
    let operationError;
    const cleanupErrors = [];
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(text);
      if (existing) {
        await handle.chmod(existing.mode & 0o7777);
      }
      await handle.sync();
      await handle.close();
      handle = null;
      await this.#assertWritable(lease);
      const current = await inspectTarget(state, lexicalTarget, path);
      if (expected !== undefined) {
        const currentBytes = await readPreimage(lexicalTarget);
        const currentHash = currentBytes === null ? null : digest(currentBytes);
        if (currentHash !== expected) {
          throw errorWithCode(`preimage hash mismatch for ${path}`, 'PREIMAGE_MISMATCH');
        }
      }
      if (current.stats && !current.stats.isFile()) {
        throw errorWithCode('target must be a regular file', 'INVALID_TARGET');
      }
      await this.#assertWritable(lease);
      await rename(temporary, lexicalTarget);
    } catch (error) {
      operationError = error;
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch (error) {
          cleanupErrors.push(error);
        } finally {
          handle = null;
        }
      }
      try {
        await rm(temporary, { force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (operationError && cleanupErrors.length > 0) {
      throw new AggregateError([operationError, ...cleanupErrors], 'atomic write failed and cleanup failed');
    }
    if (operationError) {
      throw operationError;
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'atomic write cleanup failed');
    }

    return { path: target, hash: digest(text) };
  }
}

const isWithinAny = (roots, candidate) => roots.some((root) => isWithin(root, candidate));

const inspectTarget = async (state, lexicalTarget, displayPath) => {
  let stats;
  try {
    stats = await lstat(lexicalTarget);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    const canonicalParent = await realpath(dirname(lexicalTarget));
    const canonical = join(canonicalParent, lexicalTarget.split(sep).pop());
    if (!isWithinAny(state.paths, canonical)) {
      throw errorWithCode(`target is outside ownership scope: ${displayPath}`, 'OUT_OF_SCOPE');
    }
    return { canonical, stats: null };
  }

  const canonical = await realpath(lexicalTarget);
  if (!isWithinAny(state.paths, canonical)) {
    throw errorWithCode(`target is outside ownership scope: ${displayPath}`, 'OUT_OF_SCOPE');
  }
  if (stats.isSymbolicLink()) {
    throw errorWithCode('target must not be a symlink', 'SYMLINK_TARGET');
  }
  if (!stats.isFile()) {
    throw errorWithCode('target must be a regular file', 'INVALID_TARGET');
  }
  return { canonical, stats };
};

const readPreimage = async (target) => {
  try {
    return await readFile(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const snapshotScope = async (state) => {
  const snapshots = {};
  const visit = async (path) => {
    const stats = await lstat(path);
    const canonical = await realpath(path);
    if (!isWithinAny(state.paths, canonical)) {
      throw errorWithCode(`scope changed outside ownership: ${path}`, 'OUT_OF_SCOPE');
    }
    if (stats.isSymbolicLink()) {
      throw errorWithCode(`scope contains a symlink: ${path}`, 'SYMLINK_SCOPE');
    }
    if (stats.isDirectory()) {
      const names = await readdir(path);
      names.sort();
      for (const name of names) {
        await visit(join(path, name));
      }
      return;
    }
    if (stats.isFile()) {
      snapshots[canonical] = digest(await readFile(path));
    }
  };

  for (const path of state.paths) {
    await visit(path);
  }
  return Object.freeze(snapshots);
};
