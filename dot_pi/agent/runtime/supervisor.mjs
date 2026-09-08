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

  async delegate(callerId, tasks) {
    const parent = this.#agents.get(callerId);
    if (!parent) throw new Error('Unknown delegation caller');
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
    try {
      const results = await Promise.allSettled(tasks.map(async task => {
        const agent = { ...task, id: randomUUID(), rootId: this.#rootId, parentId: callerId, waiting: false };
        this.#agents.set(agent.id, agent);
        this.#scheduler.register(agent);
        this.#scopes?.borrow(callerId, agent.id, task.paths);
        await this.#scheduler.acquire(agent.id);
        let completed = false;
        try {
          const receipt = await this.#execute(Object.freeze({ ...agent }));
          if (receipt?.stopped !== true) throw new Error('Execution has no terminal proof');
          const snapshots = await this.#scopes?.finish(agent.id);
          completed = true;
          if (receipt.error) throw receipt.error;
          return { id: agent.id, role: agent.role, result: agent.escalation ?? receipt.result, ...(snapshots ? { snapshots } : {}) };
        } finally {
          this.#scheduler.release(agent.id, { confirmed: completed });
          if (completed) this.#agents.delete(agent.id);
        }
      }));
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Delegated tasks failed');
      return results.map(result => result.value);
    } finally {
      await this.#scheduler.resume(callerId);
      await this.#scopes?.resume(callerId);
      parent.waiting = false;
    }
  }
}
