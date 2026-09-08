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
    if (!Number.isInteger(limit) || limit < 0) {
      throw new TypeError('scheduler limit must be a non-negative integer');
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
    if (role !== 'root' && !this.#agents.has(rootId)) {
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
    const agent = this.#agent(id);
    if (agent.role === 'root') {
      return;
    }
    if (agent.state !== 'idle') {
      throw stateError(`agent ${id} cannot acquire while ${agent.state}`);
    }
    if (signal?.aborted) {
      throw abortError();
    }

    const root = this.#roots.get(agent.rootId);
    if (root.active.size < this.#limit) {
      root.active.add(id);
      agent.state = 'active';
      return;
    }

    return new Promise((resolve, reject) => {
      const request = { agent, resolve, reject, signal, onAbort: null };
      request.onAbort = () => {
        const index = root.queue.indexOf(request);
        if (index !== -1) {
          root.queue.splice(index, 1);
        }
        if (agent.request === request && agent.state === 'queued') {
          agent.state = 'idle';
          agent.request = null;
          reject(abortError());
        }
      };
      agent.state = 'queued';
      agent.request = request;
      if (signal) {
        signal.addEventListener('abort', request.onAbort, { once: true });
      }
      root.queue.push(request);
    });
  }

  release(id, { confirmed = true } = {}) {
    const agent = this.#agent(id);
    if (agent.role === 'root' || agent.state === 'idle') {
      return;
    }
    if (agent.state !== 'active') {
      throw stateError(`agent ${id} cannot release while ${agent.state}`);
    }
    if (!confirmed) {
      throw stateError('terminal proof is required to release a slot');
    }
    const root = this.#roots.get(agent.rootId);
    root.active.delete(id);
    agent.state = 'idle';
    this.#drain(agent.rootId);
  }

  #drain(rootId) {
    const root = this.#roots.get(rootId);
    while (root.active.size < this.#limit && root.queue.length > 0) {
      const request = root.queue.shift();
      if (request.signal?.aborted) {
        request.onAbort();
        continue;
      }
      const { agent } = request;
      if (agent.request !== request || agent.state !== 'queued') {
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

  #agent(id) {
    const agent = this.#agents.get(id);
    if (!agent) {
      throw stateError(`agent ${id} is not registered`);
    }
    return agent;
  }
}
