import { createConnection, createServer } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const CANCELLATION_ACK_TIMEOUT_MS = 2500;
const MAX_ERROR_DETAIL_NODES = 64;
const MAX_ERROR_DETAIL_DEPTH = 8;
const MAX_ERROR_CHILDREN = 16;
const MAX_ERROR_PART_LENGTH = 1024;
const MAX_ERROR_MESSAGE_LENGTH = 8192;

const abortError = (reason) => {
  const error = new Error(reason instanceof Error ? reason.message : 'IPC request aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  if (reason !== undefined && reason !== error) error.cause = reason;
  return error;
};

const timeoutError = (method) => {
  const error = new Error(`IPC ${method} timed out`);
  error.code = 'ETIMEDOUT';
  return error;
};

const unconfirmedCancellationError = (reason) => {
  const error = new Error('IPC cancellation was not confirmed');
  error.code = 'IPC_CANCEL_UNCONFIRMED';
  error.cause = reason;
  return error;
};

const cancellationFailure = (reason, frame) => {
  const failure = new Error(frame.error ?? 'request failed');
  const error = new Error(`${reason.message}; server reported: ${failure.message}`);
  error.name = reason.name;
  if (reason.code !== undefined) error.code = reason.code;
  error.cause = new AggregateError([reason, failure], `IPC cancellation failed: ${failure.message}`);
  return error;
};

const serializeError = (error) => {
  const parts = [];
  const pending = [{ value: error, depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  const enqueue = (value, depth) => {
    if (pending.length < MAX_ERROR_DETAIL_NODES) pending.push({ value, depth });
  };
  const append = (value) => {
    if (typeof value !== 'string' || value.length === 0) return;
    parts.push(value.length > MAX_ERROR_PART_LENGTH ? `${value.slice(0, MAX_ERROR_PART_LENGTH - 1)}…` : value);
  };

  while (pending.length > 0 && nodes < MAX_ERROR_DETAIL_NODES) {
    const { value, depth } = pending.shift();
    nodes += 1;
    if (typeof value === 'string') {
      append(value);
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);

    try { append(value.message); } catch { /* Ignore hostile error accessors. */ }
    if (depth >= MAX_ERROR_DETAIL_DEPTH) continue;

    try {
      if (Array.isArray(value.errors)) {
        for (let index = 0; index < value.errors.length && index < MAX_ERROR_CHILDREN; index += 1) {
          enqueue(value.errors[index], depth + 1);
        }
      }
    } catch { /* Ignore hostile error accessors. */ }
    try {
      if (value.cause !== undefined) enqueue(value.cause, depth + 1);
    } catch { /* Ignore hostile error accessors. */ }
  }

  const message = parts.join(': ');
  if (message.length === 0) return 'request failed';
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const parseFrame = (line) => {
  if (line.length > MAX_FRAME_BYTES) {
    throw new Error('frame is too large');
  }
  return JSON.parse(line.toString('utf8'));
};

const encode = (frame) => `${JSON.stringify(frame)}\n`;

const send = (socket, response) => {
  if (socket.destroyed || !socket.writable) {
    return;
  }

  try {
    socket.write(encode(response));
  } catch {
    socket.destroy();
  }
};

const createFrameReader = (socket, onFrame, onError) => {
  let buffer = Buffer.alloc(0);
  let closed = false;

  const fail = (error) => {
    if (closed) return;
    closed = true;
    socket.off('data', onData);
    socket.off('error', failAsError);
    socket.off('close', onClose);
    onError(error);
    socket.destroy();
  };

  const onData = (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);

    let split = buffer.indexOf(0x0a);
    while (split !== -1) {
      const frame = buffer.subarray(0, split);
      buffer = buffer.subarray(split + 1);
      try {
        onFrame(parseFrame(frame));
      } catch {
        fail(new Error('frame is malformed'));
        return;
      }
      split = buffer.indexOf(0x0a);
    }

    if (buffer.length > MAX_FRAME_BYTES) {
      fail(new Error('frame is malformed'));
    }
  };

  const failAsError = (error) => {
    fail(error);
  };

  const onClose = () => {
    fail(new Error('IPC connection closed'));
  };

  socket.on('data', onData);
  socket.on('error', failAsError);
  socket.on('close', onClose);
};

export const credential = (masterToken, agentId) => {
  return createHmac('sha256', String(masterToken)).update(String(agentId)).digest('hex');
};

export const listen = async ({ socketPath, token, handle }) => {
  try {
    await stat(socketPath);
    const error = new Error(`listen EADDRINUSE: ${socketPath}`);
    error.code = 'EADDRINUSE';
    throw error;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const parent = dirname(socketPath);
  try {
    await stat(parent);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(parent, { recursive: true });
  }
  await chmod(parent, 0o700);

  const server = createServer();
  const connections = new Set();
  let closed;

  const verify = (agentId, claim) => {
    return safeEqual(claim, credential(token, agentId));
  };

  const handleDispatchFailure = (socket, request, error, close = false) => {
    send(socket, {
      id: request?.id ?? null,
      success: false,
      error: serializeError(error),
    });
    if (close) {
      socket.destroy();
    }
  };

  const abortRequests = (connection) => {
    for (const { controller } of connection.requests.values()) controller.abort();
    connection.requests.clear();
  };

  const dispatch = async (connection, request) => {
    const { socket } = connection;
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      handleDispatchFailure(socket, null, new Error('malformed request'), true);
      return;
    }

    let requestId;
    let controller;
    let requestState;
    try {
      const { id, type, method, params, token: claim, agentId } = request;
      if (typeof id !== 'string' && typeof id !== 'number') {
        handleDispatchFailure(socket, request, new Error('malformed request'), true);
        return;
      }
      if (typeof agentId !== 'string' || typeof claim !== 'string') {
        handleDispatchFailure(socket, request, new Error('malformed request'), true);
        return;
      }
      if (!verify(agentId, claim)) {
        handleDispatchFailure(socket, request, new Error('invalid authentication'), true);
        return;
      }

      requestId = String(id);
      if (type === 'cancel') {
        const requestState = connection.requests.get(requestId);
        if (requestState?.agentId === agentId) requestState.controller.abort();
        return;
      }
      if (typeof method !== 'string' || type !== undefined) {
        handleDispatchFailure(socket, request, new Error('malformed request'), true);
        return;
      }
      if (connection.requests.has(requestId)) {
        handleDispatchFailure(socket, request, new Error('duplicate request id'), true);
        return;
      }

      controller = new AbortController();
      requestState = { agentId, controller };
      connection.requests.set(requestId, requestState);
      const result = await handle(method, params, { agentId, signal: controller.signal });
      send(socket, { id, success: true, result });
    } catch (error) {
      handleDispatchFailure(socket, request, error);
    } finally {
      if (requestId !== undefined && requestState && connection.requests.get(requestId) === requestState) {
        connection.requests.delete(requestId);
      }
    }
  };

  const closeSocket = (connection) => {
    connection.closed = true;
    abortRequests(connection);
    const { socket } = connection;
    socket.destroy();
    connections.delete(connection);
  };

  server.on('connection', (socket) => {
    const connection = { socket, requests: new Map(), closed: false };
    connections.add(connection);
    createFrameReader(
      socket,
      (request) => {
        if (connection.closed) return;
        void dispatch(connection, request).catch((error) => {
          handleDispatchFailure(socket, null, error, true);
        });
      },
      () => {
        connection.closed = true;
        abortRequests(connection);
        connections.delete(connection);
      },
    );
  });

  await new Promise((resolve, reject) => {
    server.listen(socketPath, resolve);
    server.once('error', reject);
  });

  try {
    await chmod(socketPath, 0o600);
  } catch (error) {
    await rm(socketPath, { force: true });
    await new Promise((resolve, reject) => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
    throw error;
  }

  return {
    close: async () => {
      if (closed) return closed;
      closed = new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      for (const connection of connections) closeSocket(connection);
      await closed;
      await rm(socketPath, { force: true });
    },
  };
};

export class Client {
  #socket;
  #token;
  #agentId;
  #timeoutMs;
  #closed = false;
  #nextId = 1;
  #pending = new Map();
  #closedPromise;

  constructor({ socket, token, agentId, timeoutMs }) {
    this.#token = token;
    this.#agentId = agentId;
    this.#timeoutMs = timeoutMs;
    this.#socket = socket;
    this.#closedPromise = new Promise((resolve) => {
      this.#socket.once('close', resolve);
    });
    createFrameReader(
      this.#socket,
      (frame) => this.#onFrame(frame),
      (error) => this.#failPending(error),
    );
  }

  #failPending(error) {
    this.#closed = true;
    for (const entry of this.#pending.values()) {
      clearTimeout(entry.timeout);
      clearTimeout(entry.ackTimeout);
      entry.signal?.removeEventListener('abort', entry.onAbort);
      entry.reject(error);
    }
    this.#pending.clear();
  }

  #onFrame(frame) {
    const request = this.#pending.get(String(frame.id));
    if (!request) return;

    this.#pending.delete(String(frame.id));
    clearTimeout(request.timeout);
    clearTimeout(request.ackTimeout);
    request.signal?.removeEventListener('abort', request.onAbort);
    if (request.cancelReason) {
      request.reject(frame.success === true ? request.cancelReason : cancellationFailure(request.cancelReason, frame));
      return;
    }
    if (frame.success === true) {
      request.resolve(frame.result);
      return;
    }
    request.reject(new Error(frame.error ?? 'request failed'));
  }

  #sendCancel(id) {
    if (this.#closed || this.#socket.destroyed || !this.#socket.writable) return;
    try {
      this.#socket.write(encode({
        id,
        type: 'cancel',
        token: this.#token,
        agentId: this.#agentId,
      }));
    } catch {
      this.#socket.destroy();
    }
  }

  #cancelUnconfirmed(id) {
    const entry = this.#pending.get(id);
    if (!entry?.cancelReason) return;
    this.#pending.delete(id);
    clearTimeout(entry.ackTimeout);
    entry.reject(unconfirmedCancellationError(entry.cancelReason));
    this.#socket.destroy();
  }

  #cancel(id, error) {
    const entry = this.#pending.get(id);
    if (!entry || entry.cancelReason) return;
    clearTimeout(entry.timeout);
    entry.timeout = undefined;
    entry.signal?.removeEventListener('abort', entry.onAbort);
    entry.cancelReason = error;
    entry.ackTimeout = setTimeout(() => this.#cancelUnconfirmed(id), CANCELLATION_ACK_TIMEOUT_MS);
    this.#sendCancel(id);
  }

  async call(method, params, options = {}) {
    if (this.#closed) {
      throw new Error('IPC connection is closed');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('IPC call options must be an object');
    }
    const { signal } = options;
    if (signal !== undefined && (
      typeof signal !== 'object' ||
      typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function' ||
      typeof signal.aborted !== 'boolean'
    )) {
      throw new TypeError('IPC call signal must be an AbortSignal');
    }
    const timeoutMs = options.timeoutMs === null ? null : options.timeoutMs ?? this.#timeoutMs;
    if (timeoutMs !== null && timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new TypeError('IPC call timeoutMs must be positive');
    }
    if (signal?.aborted) throw abortError(signal.reason);

    const id = String(this.#nextId++);
    return new Promise((resolve, reject) => {
      const onAbort = () => this.#cancel(id, abortError(signal.reason));
      const timeout = timeoutMs === null || timeoutMs === undefined ? undefined : setTimeout(() => {
        this.#cancel(id, timeoutError(method));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timeout, signal, onAbort, ackTimeout: undefined, cancelReason: undefined });
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        this.#socket.write(
          encode({
            id,
            method,
            params,
            token: this.#token,
            agentId: this.#agentId,
          }),
        );
      } catch (error) {
        this.#pending.delete(id);
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      }
    });
  }

  async close() {
    if (this.#closed) {
      return this.#closedPromise;
    }

    this.#closed = true;
    this.#failPending(new Error('IPC connection closed'));
    this.#socket.end();
    await this.#closedPromise;
  }
}

export const connect = async ({ socketPath, token, agentId, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
  const socket = createConnection({ path: socketPath });
  const client = new Client({ socket, token, agentId, timeoutMs });

  await new Promise((resolve, reject) => {
    const ready = () => {
      resolve();
    };

    const fail = (error) => {
      socket.destroy();
      reject(error);
    };

    socket.once('error', fail);
    socket.once('connect', ready);
  });

  return client;
};
