import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const MARKER_PREFIX = '.pi-supervisor-';
const MARKER_SUFFIX = '.json';
const JOB_FIELDS = new Set(['id', 'pid', 'role', 'paths', 'state']);

const journalError = (message) => new Error(`journal error: ${message}`);

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
};

const requirePid = (value, name) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
};

const canonicalDirectory = async (directory) => {
  const candidate = resolve(requireString(directory, 'directory'));
  await mkdir(candidate, { recursive: true, mode: 0o700 });
  await chmod(candidate, 0o700);
  const details = await stat(candidate);
  if (!details.isDirectory()) {
    throw new TypeError('directory must be a directory');
  }
  return realpath(candidate);
};

const canonicalCwd = async (cwd) => {
  const candidate = resolve(requireString(cwd, 'cwd'));
  const canonical = await realpath(candidate);
  if (!(await stat(canonical)).isDirectory()) {
    throw new TypeError('cwd must be a directory');
  }
  return canonical;
};

const birthIdentity = (pid) => new Promise((resolveIdentity) => {
  const child = spawn('ps', ['-p', String(pid), '-o', 'lstart='], {
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let output = '';
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    resolveIdentity(value);
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.once('error', () => finish(null));
  child.once('close', (code) => finish(code === 0 && output.trim() ? output.trim() : null));
});

const markerName = () => `${MARKER_PREFIX}${randomUUID()}${MARKER_SUFFIX}`;

const markerFile = (directory, name) => join(directory, name);

const writeAtomic = async (path, marker) => {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(marker)}\n`, 'utf8');
    await handle.chmod(0o600);
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } catch (error) {
    const cleanupErrors = [];
    if (handle) {
      try {
        await handle.close();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      await rm(temporary, { force: true });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], 'journal write cleanup failed');
    }
    throw error;
  }
};

const isMarker = (value) => value && typeof value === 'object' &&
  typeof value.cwd === 'string' &&
  typeof value.rootId === 'string' &&
  Number.isInteger(value.pid) &&
  typeof value.birthIdentity === 'string' &&
  value.jobs && typeof value.jobs === 'object' && !Array.isArray(value.jobs);

const readMarkers = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const markers = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(MARKER_PREFIX) || !entry.name.endsWith(MARKER_SUFFIX)) {
      continue;
    }
    const path = markerFile(directory, entry.name);
    let value;
    try {
      value = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw journalError(`marker ${entry.name} is unreadable: ${error.message}`);
    }
    if (!isMarker(value)) {
      throw journalError(`marker ${entry.name} is malformed`);
    }
    markers.push({ path, value });
  }
  return markers;
};

const sameCanonicalCwd = async (markerCwd, cwd) => {
  try {
    return (await realpath(markerCwd)) === cwd;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return resolve(markerCwd) === cwd;
  }
};

const normalizeJob = (job = {}) => {
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    throw new TypeError('job must be an object');
  }
  for (const key of Object.keys(job)) {
    if (!JOB_FIELDS.has(key)) throw new TypeError(`job field ${key} is not controlled`);
  }
  const id = requireString(job.id, 'job id');
  const pid = requirePid(job.pid, 'job pid');
  const role = requireString(job.role, 'job role');
  if (!Array.isArray(job.paths) || job.paths.some((path) => typeof path !== 'string')) {
    throw new TypeError('job paths must be an array of strings');
  }
  const state = requireString(job.state, 'job state');
  return Object.freeze({ id, pid, role, paths: Object.freeze([...job.paths]), state });
};

export class Journal {
  #path;
  #marker;
  #closed = false;
  #completion = null;
  #write = Promise.resolve();

  constructor(path, marker) {
    this.#path = path;
    this.#marker = marker;
  }

  get path() {
    return this.#path;
  }

  get markerPath() {
    return this.#path;
  }

  async update(job) {
    if (this.#closed || this.#completion) throw journalError('journal is complete');
    const metadata = normalizeJob(job);
    this.#marker.jobs[metadata.id] = metadata;
    const next = this.#write.then(() => writeAtomic(this.#path, this.#marker));
    this.#write = next;
    await next;
    return metadata;
  }

  async complete(options = {}) {
    const confirmed = options === true || options?.allStopped === true || options?.confirmed === true;
    if (!confirmed) throw journalError('all stops must be confirmed before completion');
    if (this.#completion) return this.#completion;
    if (this.#closed) return;
    this.#closed = true;
    this.#completion = (async () => {
      await this.#write;
      await rm(this.#path, { force: true });
    })();
    return this.#completion;
  }
}

export async function begin({
  directory,
  cwd,
  rootId,
  supervisorPid = process.pid,
  identity = birthIdentity,
  getBirthIdentity,
} = {}) {
  const journalDirectory = await canonicalDirectory(directory);
  const canonical = await canonicalCwd(cwd);
  const id = requireString(rootId, 'rootId');
  const pid = requirePid(supervisorPid, 'supervisorPid');
  const identify = getBirthIdentity ?? identity;
  if (typeof identify !== 'function') throw new TypeError('identity must be a function');

  const currentIdentity = await identify(pid);
  if (typeof currentIdentity !== 'string' || currentIdentity.length === 0) {
    throw journalError(`birth identity for supervisor ${pid} is unknown`);
  }

  for (const { value } of await readMarkers(journalDirectory)) {
    if (!(await sameCanonicalCwd(value.cwd, canonical))) continue;
    const existingIdentity = await identify(value.pid);
    if (typeof existingIdentity !== 'string' || existingIdentity.length === 0 || existingIdentity !== value.birthIdentity) {
      throw journalError(`unresolved marker for ${canonical}`);
    }
  }

  const marker = {
    cwd: canonical,
    rootId: id,
    pid,
    birthIdentity: currentIdentity,
    jobs: Object.create(null),
  };
  const path = markerFile(journalDirectory, markerName());
  await writeAtomic(path, marker);
  return new Journal(path, marker);
}

export { birthIdentity as getBirthIdentity };
