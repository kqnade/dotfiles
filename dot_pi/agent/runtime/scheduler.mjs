const ROLES = new Set(['root', 'astra', 'sol', 'luna', 'spark']);

const stateError = (message) => new Error(`scheduler state error: ${message}`);

const abortError = () => {
  const error = new Error('scheduler acquisition aborted');
  error.name = 'AbortError';
  return error;
};

export class Scheduler {
  #limit;
  #agents = new Map();
  #roots = new Map();

  constructor({ limit = 4 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError('scheduler limit must be a positive integer');
    }
    this.#limit = limit;
  }

  register({ id, rootId, parentId = null, role } = {}) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('scheduler agent id must be a non-empty string');
    }
    if (typeof rootId !== 'string' || rootId.length === 0) {
      throw new TypeError('scheduler rootId must be a non-empty string');
    }
    if (!ROLES.has(role)) {
      throw new TypeError(`scheduler role must be one of ${[...ROLES].join(', ')}`);
    }
    if (parentId !== null && (typeof parentId !== 'string' || parentId.length === 0)) {
      throw new TypeError('scheduler parentId must be null or a non-empty string');
    }
    if (this.#agents.has(id)) {
      throw stateError(`agent ${id} is already registered`);
    }
    if (role === 'root' && (parentId !== null || id !== rootId)) {
      throw stateError('root agents must use their id as rootId and have no parent');
    }
    if (role !== 'root' && !this.#roots.has(rootId)) {
      throw stateError(`root ${rootId} is not registered`);
    }
    if (parentId !== null) {
      const parent = this.#agents.get(parentId);
      if (!parent) {
        throw stateError(`parent ${parentId} is not registered`);
      }
      if (parent.rootId !== rootId) {
        throw stateError(`parent ${parentId} belongs to another root`);
      }
    }

    this.#agents.set(id, {
      id,
      rootId,
      parentId,
      role,
      state: role === 'root' ? 'root' : 'idle',
      request: null,
    });
    if (role === 'root') {
      this.#roots.set(rootId, { active: new Set(), queue: [] });
    }
  }

  async acquire(id, { signal } = {}) {
    return this.#acquire(id, { signal, previousState: 'idle', kind: 'runnable' });
  }

  async park(id) {
    const agent = this.#agent(id);
    if (agent.role === 'root') {
      return;
    }
    if (agent.state !== 'active') {
      throw stateError(`agent ${id} cannot park while ${agent.state}`);
    }
    const root = this.#roots.get(agent.rootId);
    root.active.delete(id);
    agent.state = 'parked';
    this.#drain(agent.rootId);
  }

  async resume(id, { signal } = {}) {
    return this.#acquire(id, { signal, previousState: 'parked', kind: 'resume' });
  }

  snapshot(rootId) {
    const root = this.#root(rootId);
    const agents = [...this.#agents.values()].filter((agent) => agent.rootId === rootId);
    const active = [...root.active];
    const parked = agents.filter((agent) => agent.state === 'parked').map(({ id }) => id);
    const quarantined = agents
      .filter((agent) => agent.state === 'quarantined')
      .map(({ id }) => id);
    const queued = root.queue.map(({ agent }) => agent.id);
    const resumeQueue = root.queue
      .filter(({ kind }) => kind === 'resume')
      .map(({ agent }) => agent.id);
    const runnableQueue = root.queue
      .filter(({ kind }) => kind === 'runnable')
      .map(({ agent }) => agent.id);
    return {
      rootId,
      limit: this.#limit,
      available: this.#limit - active.length,
      active,
      parked,
      quarantined,
      queued,
      resumeQueue,
      runnableQueue,
    };
  }

  release(id, { confirmed = true } = {}) {
    const agent = this.#agent(id);
    if (agent.role === 'root' || agent.state === 'idle') {
      return;
    }
    if (agent.state === 'quarantined') {
      if (!confirmed) {
        return;
      }
      this.#reclaim(agent);
      return;
    }
    if (agent.state !== 'active') {
      throw stateError(`agent ${id} cannot release while ${agent.state}`);
    }
    if (!confirmed) {
      agent.state = 'quarantined';
      return;
    }
    this.#reclaim(agent);
  }

  #drain(rootId) {
    const root = this.#root(rootId);
    while (root.active.size < this.#limit) {
      const request = root.queue.shift();
      if (!request) {
        return;
      }
      if (request.signal?.aborted) {
        request.onAbort();
        continue;
      }
      const { agent } = request;
      if (agent.request !== request || agent.state !== request.queuedState) {
        continue;
      }
      if (request.signal) {
        request.signal.removeEventListener('abort', request.onAbort);
      }
      agent.request = null;
      agent.state = 'active';
      root.active.add(agent.id);
      request.resolve();
    }
  }

  #acquire(id, { signal, previousState, kind }) {
    const agent = this.#agent(id);
    if (agent.role === 'root') {
      return Promise.resolve();
    }
    if (agent.state !== previousState) {
      throw stateError(`agent ${id} cannot ${kind} while ${agent.state}`);
    }
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }

    const root = this.#roots.get(agent.rootId);
    if (root.active.size < this.#limit) {
      root.active.add(id);
      agent.state = 'active';
      return Promise.resolve();
    }

    const queuedState = kind === 'resume' ? 'resuming' : 'queued';
    const queue = root.queue;
    return new Promise((resolve, reject) => {
      const request = {
        agent,
        kind,
        previousState,
        queuedState,
        resolve,
        reject,
        signal,
        onAbort: null,
      };
      request.onAbort = () => {
        const index = queue.indexOf(request);
        if (index !== -1) {
          queue.splice(index, 1);
        }
        if (agent.request === request && agent.state === queuedState) {
          agent.state = previousState;
          agent.request = null;
          reject(abortError());
        }
      };
      agent.state = queuedState;
      agent.request = request;
      if (signal) {
        signal.addEventListener('abort', request.onAbort, { once: true });
      }
      queue.push(request);
    });
  }

  #reclaim(agent) {
    const root = this.#root(agent.rootId);
    root.active.delete(agent.id);
    agent.state = 'idle';
    this.#drain(agent.rootId);
  }

  #root(rootId) {
    const root = this.#roots.get(rootId);
    if (!root) {
      throw stateError(`root ${rootId} is not registered`);
    }
    return root;
  }

  #agent(id) {
    const agent = this.#agents.get(id);
    if (!agent) {
      throw stateError(`agent ${id} is not registered`);
    }
    return agent;
  }
}
