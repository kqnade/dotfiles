import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { begin } from './journal.mjs';
import { RpcClient } from './rpc.mjs';
import { Scopes } from './scopes.mjs';
import { Supervisor } from './supervisor.mjs';

const abortError = (reason) => {
  const error = new Error(reason instanceof Error ? reason.message : 'Session operation aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  if (reason !== undefined && reason !== error) error.cause = reason;
  return error;
};

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw abortError(signal.reason);
};

const waitForSignal = (promise, signal) => {
  if (!promise || !signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError(signal.reason));
    };
    const onResolve = (value) => {
      cleanup();
      resolve(value);
    };
    const onReject = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(onResolve, onReject);
  });
};

const combinedSignal = (...signals) => {
  const active = signals.filter(Boolean);
  if (active.length === 0) return { signal: undefined, dispose: () => {} };
  if (active.length === 1) return { signal: active[0], dispose: () => {} };

  const controller = new AbortController();
  const listeners = [];
  const abort = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    const listener = () => abort(signal);
    listeners.push([signal, listener]);
    signal.addEventListener('abort', listener, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
    },
  };
};

class Session {
  #journal;
  #scopes;
  #supervisor;
  #rootId;
  #launch;
  #workerEnvironment;
  #operations = new Set();
  #clients = new Set();
  #agentSignals = new Map();
  #closing;
  #cancellation = new AbortController();
  #closed = false;
  #failure;
  #rootReady;
  #releaseRoot;
  #rootRegistered = false;

  constructor({ journal, scopes, rootId, launch, workerEnvironment, externalRoot }) {
    this.#journal = journal;
    this.#scopes = scopes;
    this.#rootId = rootId;
    this.#launch = launch;
    this.#workerEnvironment = workerEnvironment;
    if (externalRoot) this.#rootReady = new Promise(resolve => { this.#releaseRoot = resolve; });
    this.#supervisor = new Supervisor({ rootId, scopes, execute: agent => this.#execute(agent) });
  }

  snapshot() { return this.#supervisor.snapshot(); }

  async invoke(agentId, method, params = {}, { signal } = {}) {
    if (agentId === this.#rootId) await waitForSignal(this.#rootReady, signal);
    throwIfAborted(signal);
    if (this.#failure) throw this.#failure;
    if (this.#closed) throw new Error('Session is closed');
    const agent = this.#supervisor.permit(agentId);
    if (method === 'permit') return agent;
    if (method === 'delegate') return this.delegate(params.tasks, agentId, { signal });
    if (method === 'read') {
      const result = await this.#track(this.#scopes.read(agentId, params.path));
      throwIfAborted(signal);
      return result;
    }
    if (method === 'write') {
      if (!Object.hasOwn(params, 'expectedHash') || params.expectedHash === undefined) {
        throw new Error('write requires expectedHash');
      }
      const result = await this.#track(this.#scopes.write(agentId, params.path, params.text, { expectedHash: params.expectedHash }));
      throwIfAborted(signal);
      return result;
    }
    if (method === 'edit') {
      if (typeof params.expectedHash !== 'string') {
        throw new Error('edit requires expectedHash string');
      }
      const result = await this.#track(this.#scopes.edit(
        agentId,
        params.path,
        params.oldText,
        params.newText,
        { expectedHash: params.expectedHash },
      ));
      throwIfAborted(signal);
      return result;
    }
    if (method === 'escalate') {
      const result = await this.#track(this.#supervisor.escalate(agentId, params.reason));
      throwIfAborted(signal);
      return result;
    }
    throw new Error(`Unknown broker method: ${method}`);
  }

  async registerRoot(client) {
    if (!this.#releaseRoot || this.#rootRegistered || this.#closed) throw new Error('Root registration is unavailable');
    this.#rootRegistered = true;
    const job = { id: this.#rootId, pid: client.process.pid, role: 'root', paths: this.#scopes.paths(this.#rootId) };
    const worker = { client, job, stopping: null };
    this.#clients.add(worker);
    try {
      await this.#update(job, 'starting');
      await this.#update(job, 'running');
    } finally {
      this.#releaseRoot();
    }
  }

  async #track(operation) {
    this.#operations.add(operation);
    try { return await operation; } finally { this.#operations.delete(operation); }
  }

  async delegate(tasks, callerId = this.#rootId, { signal } = {}) {
    if (this.#failure) throw this.#failure;
    if (this.#closed) throw new Error('Session is closed');
    const cancellation = combinedSignal(this.#cancellation.signal, this.#agentSignals.get(callerId), signal);
    try {
      const operation = this.#supervisor.delegate(callerId, tasks, { signal: cancellation.signal });
      return await this.#track(operation);
    } finally {
      cancellation.dispose();
    }
  }

  async #update(job, state) {
    try {
      await this.#journal.update({ ...job, state });
    } catch (error) {
      this.#failure ??= error;
      throw error;
    }
  }

  async #execute(agent) {
    if (this.#closed) return { stopped: true, error: new Error('Session is closed') };
    if (agent.signal?.aborted) return { stopped: true, error: abortError(agent.signal.reason) };
    const paths = this.#scopes.paths(agent.id);
    const env = { ...this.#launch.env, ...this.#workerEnvironment?.(agent) };
    const client = new RpcClient({ ...this.#launch, env });
    const job = { id: agent.id, pid: client.process.pid, role: agent.role, paths };
    const worker = { client, job, stopping: null };
    this.#clients.add(worker);
    this.#agentSignals.set(agent.id, agent.signal);
    const errors = [];
    let cancellationError;
    let result;
    const onAbort = () => {
      cancellationError ??= abortError(agent.signal.reason);
      void this.#stop(worker).catch(error => { errors.push(error); });
    };
    agent.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      try {
        throwIfAborted(agent.signal);
        await this.#update(job, 'starting');
        await client.initialize(agent.role);
        if (this.#closed) throw new Error('Session is closed');
        throwIfAborted(agent.signal);
        await this.#update(job, 'running');
        if (this.#closed) throw new Error('Session is closed');
        throwIfAborted(agent.signal);
        result = await client.run(agent.task);
      } catch (error) {
        errors.push(error);
      }
      const stop = await this.#stop(worker);
      errors.push(...stop.errors);
      if (cancellationError) errors.unshift(cancellationError);
      const error = errors.length > 1 ? new AggregateError(errors, 'RPC worker failed') : errors[0];
      return { stopped: stop.stopped, result, error };
    } finally {
      agent.signal?.removeEventListener('abort', onAbort);
      this.#agentSignals.delete(agent.id);
    }
  }

  async #stop(worker) {
    worker.stopping ??= (async () => {
      const { client, job } = worker;
      const errors = [];
      let stopped = false;
      try { await this.#update(job, 'stopping'); } catch (error) { errors.push(error); }
      try {
        await client.close();
        stopped = true;
        this.#clients.delete(worker);
      } catch (error) {
        this.#failure ??= error;
        errors.push(error);
      }
      try { await this.#update(job, stopped ? 'stopped' : 'quarantined'); } catch (error) { errors.push(error); }
      return { stopped, errors };
    })();
    return worker.stopping;
  }

  async close() {
    this.#closed = true;
    this.#releaseRoot?.();
    this.#cancellation.abort();
    this.#closing ??= (async () => {
      const stops = await Promise.allSettled([...this.#clients].map(worker => this.#stop(worker)));
      await Promise.allSettled([...this.#operations]);
      for (const stop of stops) {
        if (stop.status === 'rejected') this.#failure ??= stop.reason;
      }
      if (this.#failure) throw this.#failure;
      const { active, queued, parked, quarantined } = this.snapshot();
      if ([active, queued, parked, quarantined].some(ids => ids.length !== 0)) {
        throw new Error('Session has unconfirmed workers');
      }
      await this.#journal.complete({ allStopped: true });
    })();
    return this.#closing;
  }
}

export async function startSession({ cwd, directory, rootId = randomUUID(), command, args = [], env = process.env, workerEnvironment, externalRoot = false, skillResources = [] }) {
  if (typeof command !== 'string' || !command) throw new TypeError('RPC command is required');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('RPC args must be strings');
  if (workerEnvironment !== undefined && typeof workerEnvironment !== 'function') throw new TypeError('workerEnvironment must be a function');
  const canonicalCwd = await realpath(cwd);
  const scopes = new Scopes({ cwd: canonicalCwd, rootId, skillResources });
  const journal = await begin({ cwd: canonicalCwd, directory, rootId });
  return new Session({
    journal, scopes, rootId, workerEnvironment, externalRoot,
    launch: { cwd: canonicalCwd, command, args: [...args], env: { ...env } },
  });
}
