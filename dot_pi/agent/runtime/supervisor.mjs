import { randomUUID } from 'node:crypto';
import { Scheduler } from './scheduler.mjs';

const children = { root: ['astra'], astra: ['sol', 'luna', 'spark'], sol: [], luna: [], spark: [] };

export class Supervisor {
  #scheduler = new Scheduler();
  #agents = new Map();
  #rootId;
  #execute;
  #scopes;

  constructor({ rootId = randomUUID(), execute, scopes }) {
    if (typeof execute !== 'function') throw new TypeError('execute is required');
    this.#rootId = rootId;
    this.#execute = execute;
    this.#scopes = scopes;
    const root = { id: rootId, rootId, parentId: null, role: 'root', waiting: false };
    this.#agents.set(rootId, root);
    this.#scheduler.register(root);
  }

  snapshot() { return this.#scheduler.snapshot(this.#rootId); }

  permit(id) {
    const agent = this.#agents.get(id);
    if (!agent) throw new Error('Unknown agent');
    const { active, quarantined } = this.snapshot();
    if (agent.waiting || quarantined.includes(id) || (agent.role !== 'root' && !active.includes(id))) {
      throw new Error('Agent is not runnable');
    }
    return { id, role: agent.role };
  }

  async escalate(id, reason) {
    const agent = this.#agents.get(id);
    const parent = this.#agents.get(agent?.parentId);
    if (agent?.role !== 'sol' || parent?.role !== 'astra' || !parent.waiting) {
      throw new Error('Only delegated Sol can escalate to its waiting Astra');
    }
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Escalation reason is required');
    await this.#scopes?.pause(id);
    agent.escalation = Object.freeze({ status:'escalated', to:parent.id, reason });
    return agent.escalation;
  }

  async delegate(callerId, tasks, options = {}) {
    const parent = this.#agents.get(callerId);
    if (!parent) throw new Error('Unknown delegation caller');
    const lifetimeSignal = parent.signal;
    const signal = options.signal ?? lifetimeSignal;
    if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Delegation requires tasks');
    for (const task of tasks) {
      if (!children[parent.role].includes(task.role)) throw new Error(`${parent.role} cannot delegate to ${task.role}`);
      if (typeof task.task !== 'string' || !task.task.trim()) throw new Error('Task text is required');
    }
    if (parent.waiting) throw new Error('Caller already has an active delegation');
    if (parent.role === 'root' && tasks.length !== 1) throw new Error('Sol must escalate to one Astra');
    parent.waiting = true;
    await this.#scopes?.pause(callerId);
    await this.#scheduler.park(callerId);
    let recoverable = true;
    try {
      const results = await Promise.allSettled(tasks.map(async task => {
        const agent = { ...task, id: randomUUID(), rootId: this.#rootId, parentId: callerId, waiting: false, signal };
        this.#agents.set(agent.id, agent);
        this.#scheduler.register(agent);
        let borrowed = false;
        let started = false;
        let completed = false;
        try {
          await this.#scopes?.borrow(callerId, agent.id, task.paths);
          borrowed = Boolean(this.#scopes);
          await this.#scheduler.acquire(agent.id, { signal });
          started = true;
          const receipt = await this.#execute(Object.freeze({ ...agent }));
          if (receipt?.stopped !== true) throw new Error('Execution has no terminal proof', { cause: receipt?.error });
          const snapshots = await this.#scopes?.finish(agent.id);
          completed = true;
          if (receipt.error) throw receipt.error;
          return { id: agent.id, role: agent.role, result: agent.escalation ?? receipt.result, ...(snapshots ? { snapshots } : {}) };
        } catch (error) {
          if (!started) {
            try {
              if (borrowed) await this.#scopes.finish(agent.id);
              completed = true;
            } catch (cleanupError) {
              throw new AggregateError([error, cleanupError], 'Unstarted worker scope could not be returned');
            }
          }
          throw error;
        } finally {
          if (!completed) {
            recoverable = false;
            if (borrowed) this.#scopes.quarantine(agent.id, 'Worker execution or scope return is unconfirmed');
          }
          this.#scheduler.release(agent.id, { confirmed: completed });
          if (completed) this.#agents.delete(agent.id);
        }
      }));
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Delegated tasks failed');
      return results.map(result => result.value);
    } finally {
      if (recoverable && !lifetimeSignal?.aborted) {
        await this.#scheduler.resume(callerId, { signal: lifetimeSignal });
        await this.#scopes?.resume(callerId);
        parent.waiting = false;
      }
    }
  }
}
