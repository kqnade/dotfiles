import { randomUUID } from 'node:crypto';
import { Scheduler } from './scheduler.mjs';

const children = { root: ['astra'], astra: ['sol', 'luna', 'spark'], sol: [], luna: [], spark: [] };

export class Supervisor {
  #scheduler = new Scheduler();
  #agents = new Map();
  #rootId;
  #execute;

  constructor({ rootId = randomUUID(), execute }) {
    if (typeof execute !== 'function') throw new TypeError('execute is required');
    this.#rootId = rootId;
    this.#execute = execute;
    const root = { id: rootId, rootId, parentId: null, role: 'root', waiting: false };
    this.#agents.set(rootId, root);
    this.#scheduler.register(root);
  }

  snapshot() { return this.#scheduler.snapshot(this.#rootId); }

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
    await this.#scheduler.park(callerId);
    try {
      const results = await Promise.allSettled(tasks.map(async task => {
        const agent = { ...task, id: randomUUID(), rootId: this.#rootId, parentId: callerId, waiting: false };
        this.#agents.set(agent.id, agent);
        this.#scheduler.register(agent);
        await this.#scheduler.acquire(agent.id);
        let completed = false;
        try {
          const result = await this.#execute(Object.freeze({ ...agent }));
          completed = true;
          return { id: agent.id, role: agent.role, result };
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
      parent.waiting = false;
    }
  }
}
