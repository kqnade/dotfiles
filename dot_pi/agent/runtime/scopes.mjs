import { relative, isAbsolute, sep } from 'node:path';
import { Ownership } from './ownership.mjs';

const within = (parent, child) => {
  const distance = relative(parent, child);
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance));
};

export class Scopes {
  #cwd;
  #entries = new Map();

  constructor({ cwd, rootId }) {
    this.#cwd = cwd;
    this.#entries.set(rootId, this.#create(rootId, null, ['.']));
  }

  #create(id, parentId, paths) {
    const ownership = new Ownership({ cwd: this.#cwd });
    return { parentId, ownership, lease: ownership.claim(id, paths), paused: false };
  }

  #get(id) {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error('Unknown scope owner');
    return entry;
  }

  async pause(id) {
    const entry = this.#get(id);
    await entry.ownership.drain(entry.lease);
    entry.paused = true;
  }

  borrow(parentId, id, paths) {
    const parent = this.#get(parentId);
    if (!parent.paused) throw new Error('Parent scope must be paused');
    if (this.#entries.has(id)) throw new Error('Scope owner already exists');
    const entry = this.#create(id, parentId, paths);
    for (const path of entry.lease.paths) {
      if (!parent.lease.paths.some(scope => within(scope, path))) throw new Error('Borrowed scope exceeds parent');
      for (const sibling of this.#entries.values()) {
        if (sibling.parentId !== parentId) continue;
        if (sibling.lease.paths.some(scope => within(scope, path) || within(path, scope))) throw new Error('Borrowed scopes overlap');
      }
    }
    this.#entries.set(id, entry);
  }

  async write(id, path, text, options) {
    const { ownership, lease } = this.#get(id);
    return ownership.run(lease, () => ownership.write(lease, path, text, options));
  }

  paths(id) {
    return this.#get(id).lease.paths;
  }

  quarantine(id, reason) {
    const entry = this.#get(id);
    return entry.ownership.quarantine(entry.lease, reason);
  }

  #assertReturned(id) {
    if ([...this.#entries.values()].some(entry => entry.parentId === id)) throw new Error('Scope has outstanding children');
  }

  async finish(id) {
    this.#assertReturned(id);
    const entry = this.#get(id);
    if (entry.parentId === null) throw new Error('Root scope cannot be returned');
    await this.pause(id);
    const { snapshots } = await entry.ownership.transfer(entry.lease, entry.parentId);
    this.#entries.delete(id);
    return snapshots;
  }

  async resume(id) {
    this.#assertReturned(id);
    const entry = this.#get(id);
    entry.paused = false;
    const { lease } = await entry.ownership.transfer(entry.lease, id);
    entry.lease = lease;
  }
}
