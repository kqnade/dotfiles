import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { begin } from './journal.mjs';
import { RpcClient } from './rpc.mjs';
import { Scopes } from './scopes.mjs';
import { Supervisor } from './supervisor.mjs';

class Session {
  #journal;
  #scopes;
  #supervisor;
  #rootId;
  #launch;
  #operations = new Set();
  #clients = new Set();
  #closing;
  #closed = false;
  #failure;

  constructor({ journal, scopes, rootId, launch }) {
    this.#journal = journal;
    this.#scopes = scopes;
    this.#rootId = rootId;
    this.#launch = launch;
    this.#supervisor = new Supervisor({ rootId, scopes, execute: agent => this.#execute(agent) });
  }

  snapshot() { return this.#supervisor.snapshot(); }

  async delegate(tasks) {
    if (this.#failure) throw this.#failure;
    if (this.#closed) throw new Error('Session is closed');
    const operation = this.#supervisor.delegate(this.#rootId, tasks);
    this.#operations.add(operation);
    try {
      return await operation;
    } finally {
      this.#operations.delete(operation);
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
    const client = new RpcClient(this.#launch);
    const job = { id: agent.id, pid: client.process.pid, role: agent.role, paths: this.#scopes.paths(agent.id) };
    const worker = { client, job, stopping: null };
    this.#clients.add(worker);
    const errors = [];
    let result;
    try {
      await this.#update(job, 'starting');
      await client.initialize(agent.role);
      if (this.#closed) throw new Error('Session is closed');
      await this.#update(job, 'running');
      if (this.#closed) throw new Error('Session is closed');
      result = await client.run(agent.task);
    } catch (error) {
      errors.push(error);
    }
    const stop = await this.#stop(worker);
    errors.push(...stop.errors);
    const error = errors.length > 1 ? new AggregateError(errors, 'RPC worker failed') : errors[0];
    return { stopped: stop.stopped, result, error };
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

export async function startSession({ cwd, directory, rootId = randomUUID(), command, args = [], env = process.env }) {
  if (typeof command !== 'string' || !command) throw new TypeError('RPC command is required');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('RPC args must be strings');
  const canonicalCwd = await realpath(cwd);
  const scopes = new Scopes({ cwd: canonicalCwd, rootId });
  const journal = await begin({ cwd: canonicalCwd, directory, rootId });
  return new Session({
    journal, scopes, rootId,
    launch: { cwd: canonicalCwd, command, args: [...args], env: { ...env } },
  });
}
