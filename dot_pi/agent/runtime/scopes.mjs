import { relative, isAbsolute, resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { Ownership, sha256 } from './ownership.mjs';
import { formatFile } from './format.mjs';

const within = (parent, child) => {
  const distance = relative(parent, child);
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance));
};

export class Scopes {
  #cwd;
  #skillResources;
  #entries = new Map();

  constructor({ cwd, rootId, skillResources = [] }) {
    this.#cwd = cwd;
    if (!Array.isArray(skillResources) && !(skillResources instanceof Set)) {
      throw new TypeError('skillResources must be an array or set');
    }
    this.#skillResources = new Set([...skillResources].map(path => {
      if (typeof path !== 'string' || !isAbsolute(path)) throw new TypeError('skill resource paths must be absolute');
      const canonical = realpathSync(path);
      if (canonical !== path) throw new Error(`skill resource path is not canonical: ${path}`);
      return canonical;
    }));
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

  async borrow(parentId, id, paths) {
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
    try {
      await entry.ownership.drain(entry.lease);
      const handoff = await entry.ownership.transfer(entry.lease, id);
      entry.lease = handoff.lease;
      return handoff;
    } catch (error) {
      if (this.#entries.get(id) === entry) this.#entries.delete(id);
      throw error;
    }
  }

  async write(id, path, text, options) {
    const { ownership, lease } = this.#get(id);
    return ownership.run(lease, () => ownership.write(lease, path, text, options));
  }

  async format(id, path, { signal } = {}) {
    const { ownership, lease } = this.#get(id);
    return formatFile({ ownership, lease, cwd: this.#cwd, path, signal });
  }

  async edit(id, path, oldText, newText, options) {
    if (typeof oldText !== 'string' || oldText.length === 0 || typeof newText !== 'string') {
      throw new TypeError('edit requires nonempty oldText and string newText');
    }
    const { ownership, lease } = this.#get(id);
    return ownership.run(lease, async () => {
      const original = await this.read(id, path);
      const first = original.text.indexOf(oldText);
      if (first === -1 || original.text.indexOf(oldText, first + 1) !== -1) {
        throw new Error('edit requires a unique oldText match');
      }
      const text = original.text.replace(oldText, () => newText);
      return ownership.write(lease, path, text, options);
    });
  }

  async read(id, path) {
    if (typeof path !== 'string' || !path) throw new TypeError('path is required');
    const { ownership, lease } = this.#get(id);
    return ownership.run(lease, async () => {
      const cwd = await realpath(this.#cwd);
      const target = await realpath(resolve(cwd, path));
      if (!within(cwd, target) && !this.#skillResources.has(target)) {
        throw new Error('Read path is outside the repository or managed skill resources');
      }
      const bytes = await readFile(target);
      if (bytes.length > 128 * 1024) throw new Error('File exceeds broker read limit (128 KiB)');
      return { path: target, text: bytes.toString('utf8'), hash: sha256(bytes) };
    });
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
    const lease = entry.ownership.renew(entry.lease);
    entry.lease = lease;
    entry.paused = false;
  }
}
