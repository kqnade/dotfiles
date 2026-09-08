import { createConnection, createServer } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

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
      error: error?.message ?? 'request failed',
    });
    if (close) {
      socket.destroy();
    }
  };

  const dispatch = async (socket, request) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      handleDispatchFailure(socket, null, new Error('malformed request'), true);
      return;
    }

    try {
      const { id, method, params, token: claim, agentId } = request;
      if (typeof id !== 'string' && typeof id !== 'number') {
        handleDispatchFailure(socket, request, new Error('malformed request'), true);
        return;
      }
      if (typeof method !== 'string' || typeof agentId !== 'string' || typeof claim !== 'string') {
        handleDispatchFailure(socket, request, new Error('malformed request'), true);
        return;
      }
      if (!verify(agentId, claim)) {
        handleDispatchFailure(socket, request, new Error('invalid authentication'), true);
        return;
      }

      const result = await handle(method, params, { agentId });
      send(socket, { id, success: true, result });
    } catch (error) {
      handleDispatchFailure(socket, request, error);
    }
  };

  const closeSocket = (socket) => {
    socket.destroy();
    connections.delete(socket);
  };

  server.on('connection', (socket) => {
    connections.add(socket);
    createFrameReader(
      socket,
      (request) => {
        void dispatch(socket, request).catch((error) => {
          handleDispatchFailure(socket, null, error, true);
        });
      },
      () => {
        connections.delete(socket);
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
      for (const socket of connections) closeSocket(socket);
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
      entry.reject(error);
    }
    this.#pending.clear();
  }

  #onFrame(frame) {
    const request = this.#pending.get(frame.id);
    if (!request) return;

    this.#pending.delete(frame.id);
    clearTimeout(request.timeout);
    if (frame.success === true) {
      request.resolve(frame.result);
      return;
    }
    request.reject(new Error(frame.error ?? 'request failed'));
  }

  async call(method, params) {
    if (this.#closed) {
      throw new Error('IPC connection is closed');
    }

    const id = String(this.#nextId++);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`IPC ${method} timed out`));
      }, this.#timeoutMs);

      this.#pending.set(id, { resolve, reject, timeout });
      this.#socket.write(
        encode({
          id,
          method,
          params,
          token: this.#token,
          agentId: this.#agentId,
        }),
      );
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
