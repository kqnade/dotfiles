import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  lstat,
  link,
  open,
  readFile,
  readlink,
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

const canonicalForScope = (cwd, candidate) => {
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
        return join(realpathSync(parent), ...missing.reverse());
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

const pathFromCwd = (cwd, value) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('path must be a non-empty string');
  }
  const candidate = isAbsolute(value) ? resolve(value) : resolve(cwd, value);
  if (!isWithin(cwd, candidate) && !isWithin(cwd, canonicalForScope(cwd, candidate))) {
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
  if (value === null) {
    return null;
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
      writeQueue: Promise.resolve(),
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

  renew(lease) {
    const state = this.#assertLease(lease);
    if (!state.draining || !state.drained || state.active.size !== 0) {
      throw errorWithCode('ownership has not been confirmed drained', 'NOT_DRAINED');
    }

    state.generation += 1;
    const nextLease = makeLease(state, lease.owner, state.generation);
    state.currentLease = nextLease;
    state.draining = false;
    state.drainPromise = null;
    state.drained = false;
    return nextLease;
  }

  async runProcess(lease, options = {}) {
    const state = this.#assertLease(lease);
    return this.run(lease, () => superviseProcess(this, lease, state, options));
  }

  quarantine(lease, reason) {
    const state = this.#assertLease(lease);
    const detail = reason instanceof Error ? reason.message : String(reason ?? '');
    if (detail.length === 0) {
      throw new TypeError('quarantine reason is required');
    }
    state.quarantined = detail;
    state.draining = true;
    state.drained = false;
    return Object.freeze({
      owner: lease.owner,
      generation: lease.generation,
      reason: detail,
    });
  }

  async write(lease, path, text, { expectedHash } = {}) {
    const state = this.#assertWritable(lease);
    const queued = state.writeQueue.then(() => this.#writeNow(lease, path, text, { expectedHash }));
    state.writeQueue = queued.catch(() => {});
    return queued;
  }

  async #writeNow(lease, path, text, { expectedHash } = {}) {
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
      if (expected !== undefined && expected !== null) {
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
      try {
        if (expected === null) {
          await link(temporary, lexicalTarget);
        } else {
          await rename(temporary, lexicalTarget);
        }
      } catch (error) {
        if (expected === null && error.code === 'EEXIST') {
          throw errorWithCode(`preimage hash mismatch for ${path}`, 'PREIMAGE_MISMATCH');
        }
        throw error;
      }
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
    let stats;
    try {
      stats = await lstat(path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      snapshots[path] = null;
      return;
    }
    if (stats.isSymbolicLink()) {
      if (!isWithinAny(state.paths, path)) {
        throw errorWithCode(`scope changed outside ownership: ${path}`, 'OUT_OF_SCOPE');
      }
      const target = await readlink(path);
      snapshots[path] = Object.freeze({
        type: 'symlink',
        target,
        hash: digest(target),
      });
      return;
    }
    const canonical = await realpath(path);
    if (!isWithinAny(state.paths, canonical)) {
      throw errorWithCode(`scope changed outside ownership: ${path}`, 'OUT_OF_SCOPE');
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

const processGroupStatus = (pid) => {
  if (process.platform === 'win32') {
    return 'unknown';
  }
  try {
    process.kill(-pid, 0);
    return 'alive';
  } catch (error) {
    if (error.code === 'ESRCH') {
      return 'empty';
    }
    if (error.code === 'EPERM') {
      return 'unknown';
    }
    throw error;
  }
};

const signalProcessGroup = (pid, signal) => {
  if (process.platform === 'win32') {
    throw errorWithCode('process groups are unverified on this platform', 'PROCESS_GROUP_UNKNOWN');
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
};

const waitForEmptyProcessGroup = async (pid, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const status = processGroupStatus(pid);
    if (status === 'empty') {
      return;
    }
    if (Date.now() >= deadline) {
      throw errorWithCode('could not prove process group is empty', 'PROCESS_GROUP_UNKNOWN');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
};

export const stopProcessGroup = async (pid, timeoutMs) => {
  const initial = processGroupStatus(pid);
  if (initial === 'empty') {
    return;
  }
  if (initial === 'unknown') {
    await waitForEmptyProcessGroup(pid, timeoutMs);
    return;
  }
  try {
    signalProcessGroup(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    await waitForEmptyProcessGroup(pid, timeoutMs);
    return;
  }
  try {
    await waitForEmptyProcessGroup(pid, timeoutMs);
  } catch (error) {
    if (error.code !== 'PROCESS_GROUP_UNKNOWN') {
      throw error;
    }
    signalProcessGroup(pid, 'SIGKILL');
    await waitForEmptyProcessGroup(pid, timeoutMs);
  }
};

const superviseProcess = (ownership, lease, state, options) => {
  const {
    command,
    args = [],
    cwd = state.cwd,
    env,
    inheritEnv = true,
    stdin = '',
    signal,
    timeoutMs = 30_000,
    maxOutputBytes = 1_048_576,
  } = options ?? {};
  if (typeof command !== 'string' || command.length === 0) {
    throw new TypeError('command must be a non-empty string');
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('args must be an array of strings');
  }
  if (typeof inheritEnv !== 'boolean') throw new TypeError('inheritEnv must be a boolean');
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
    throw new TypeError('timeoutMs must be a positive number');
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError('maxOutputBytes must be a positive integer');
  }
  if (stdin !== null && typeof stdin !== 'string' && !Buffer.isBuffer(stdin)) {
    throw new TypeError('stdin must be a string, Buffer, or null');
  }
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new TypeError('signal must be an AbortSignal');
  }
  if (signal?.aborted) {
    return Promise.reject(errorWithCode('process was aborted', 'ABORT_ERR'));
  }
  if (process.platform === 'win32') {
    ownership.quarantine(lease, 'process group cannot be proven on this platform');
    return Promise.reject(errorWithCode('process group cannot be proven on this platform', 'PROCESS_GROUP_UNKNOWN'));
  }

  const processCwd = realpathSync(pathFromCwd(state.cwd, cwd));
  if (!isWithin(state.cwd, processCwd)) {
    throw errorWithCode('process cwd is outside ownership cwd', 'OUT_OF_SCOPE');
  }
  if (!lstatSync(processCwd).isDirectory()) {
    throw errorWithCode('process cwd must be a directory', 'INVALID_CWD');
  }

  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    let pid;
    let closed = false;
    let closeCode = null;
    let closeSignal = null;
    let spawnError = null;
    let stopReason = null;
    let finalized = false;
    let finalizing = false;
    let timeoutHandle;
    let forceKillHandle;
    let abortListener;
    let stdinError = null;
    let termSent = false;
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const result = () => ({
      stdout: Buffer.concat(stdout).toString(),
      stderr: Buffer.concat(stderr).toString(),
      code: closeCode,
      signal: closeSignal,
    });

    const clearTimers = () => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      if (forceKillHandle !== undefined) {
        clearTimeout(forceKillHandle);
        forceKillHandle = undefined;
      }
    };

    const closeStreams = () => {
      child?.stdin?.destroy();
      child?.stdout?.destroy();
      child?.stderr?.destroy();
    };

    const rejectWith = (error) => {
      const output = result();
      error.stdout ??= output.stdout;
      error.stderr ??= output.stderr;
      finalized = true;
      clearTimers();
      if (signal !== undefined && abortListener !== undefined) {
        signal.removeEventListener('abort', abortListener);
      }
      rejectPromise(error);
    };

    const resolveWith = () => {
      finalized = true;
      clearTimers();
      if (signal !== undefined && abortListener !== undefined) {
        signal.removeEventListener('abort', abortListener);
      }
      resolvePromise(result());
    };

    const rememberOutput = (chunks, chunk, currentBytes, streamName) => {
      const bytes = Buffer.byteLength(chunk);
      if (currentBytes + bytes > maxOutputBytes) {
        stop(errorWithCode(`${streamName} exceeded output limit`, 'OUTPUT_LIMIT'));
        return currentBytes;
      }
      chunks.push(chunk);
      return currentBytes + bytes;
    };

    let stop;

    const quarantineAndReject = (error) => {
      try {
        ownership.quarantine(lease, error.message);
      } catch (quarantineError) {
        error = new AggregateError([error, quarantineError], 'process group could not be supervised');
      }
      rejectWith(error);
      closeStreams();
    };

    const forceStop = async () => {
      if (finalized || finalizing || pid === undefined) {
        return;
      }
      finalizing = true;
      try {
        const status = processGroupStatus(pid);
        if (status === 'unknown') {
          quarantineAndReject(errorWithCode('could not prove process group is empty', 'PROCESS_GROUP_UNKNOWN'));
          return;
        }
        if (status === 'alive') {
          signalProcessGroup(pid, 'SIGKILL');
          await waitForEmptyProcessGroup(pid, Math.min(timeoutMs, 2_000));
        }
        closeSignal ??= 'SIGKILL';
        rejectWith(stopReason ?? errorWithCode('process was stopped', 'PROCESS_STOPPED'));
        closeStreams();
      } catch (error) {
        quarantineAndReject(error);
      } finally {
        finalizing = false;
      }
    };

    stop = (reason) => {
      stopReason ??= reason;
      if (pid === undefined || closed) {
        return;
      }
      try {
        if (!termSent) {
          termSent = true;
          try {
            signalProcessGroup(pid, 'SIGTERM');
          } catch (error) {
            stopReason ??= error;
          }
          forceKillHandle = setTimeout(() => {
            forceKillHandle = undefined;
            void forceStop();
          }, 100);
        }
      } catch (error) {
        stopReason ??= error;
      }
    };
    const finish = async () => {
      if (!closed || finalized || finalizing) {
        return;
      }
      finalizing = true;
      clearTimers();

      if (spawnError !== null && pid === undefined) {
        rejectWith(spawnError);
        finalizing = false;
        return;
      }

      let groupError = null;
      try {
        const status = processGroupStatus(pid);
        if (status === 'unknown') {
          groupError = errorWithCode('could not prove process group is empty', 'PROCESS_GROUP_UNKNOWN');
        } else if (status === 'alive') {
          groupError = errorWithCode('child exited with descendants still in its process group', 'UNKNOWN_DESCENDANTS');
          await stopProcessGroup(pid, Math.min(timeoutMs, 2_000));
        }
      } catch (error) {
        groupError = error;
      }

      if (groupError !== null) {
        quarantineAndReject(groupError);
      } else if (stopReason !== null) {
        stopReason.code = stopReason.code ?? 'PROCESS_STOPPED';
        rejectWith(stopReason);
      } else if (spawnError !== null) {
        rejectWith(spawnError);
      } else if (stdinError !== null) {
        rejectWith(stdinError);
      } else if (closeCode !== 0 || closeSignal !== null) {
        const error = errorWithCode(`process exited unsuccessfully: ${command}`, 'PROCESS_FAILED');
        error.exitCode = closeCode;
        error.signal = closeSignal;
        rejectWith(error);
      } else {
        resolveWith();
      }
      finalizing = false;
    };

    try {
      child = spawn(command, args, {
        cwd: processCwd,
        env: inheritEnv ? { ...process.env, ...env } : { ...env },
        detached: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      pid = child.pid;
      child.stdout.on('data', (chunk) => {
        stdoutBytes = rememberOutput(stdout, chunk, stdoutBytes, 'stdout');
      });
      child.stderr.on('data', (chunk) => {
        stderrBytes = rememberOutput(stderr, chunk, stderrBytes, 'stderr');
      });
      child.once('error', (error) => {
        spawnError = error;
        if (!closed) {
          closed = true;
          void finish();
        }
      });
      child.once('close', (code, childSignal) => {
        closed = true;
        closeCode = code;
        closeSignal = childSignal;
        void finish();
      });
      child.stdin.once('error', (error) => {
        stdinError = error;
      });
      if (stdin === null) {
        child.stdin.end();
      } else {
        child.stdin.end(stdin);
      }
      if (signal !== undefined) {
        abortListener = () => stop(errorWithCode('process was aborted', 'ABORT_ERR'));
        signal.addEventListener('abort', abortListener, { once: true });
        if (signal.aborted) {
          abortListener();
        }
      }
      timeoutHandle = setTimeout(() => {
        stop(errorWithCode('process timed out', 'TIMEOUT'));
      }, timeoutMs);
    } catch (error) {
      stop(error);
      if (pid === undefined) {
        rejectPromise(error);
      }
    }
  });
};
