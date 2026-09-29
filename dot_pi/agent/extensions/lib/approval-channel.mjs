import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { MAX_PURPOSE_LENGTH } from './execution-guard.mjs';

export const APPROVAL_ENV = 'PI_EXECUTION_APPROVAL_CHANNEL';
const MAX_BYTES = 64 * 1024;
const MAX_PENDING = 16;

async function readJson(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Approval message too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validInvocation(value) {
  return value && typeof value === 'object'
    && typeof value.toolName === 'string' && value.toolName.length > 0 && value.toolName.length <= 128
    && typeof value.toolCallId === 'string' && value.toolCallId.length > 0 && value.toolCallId.length <= 256
    && typeof value.childSessionId === 'string' && value.childSessionId.length > 0 && value.childSessionId.length <= 256
    && typeof value.cwd === 'string' && isAbsolute(value.cwd)
    && (value.purpose === undefined || (typeof value.purpose === 'string' && value.purpose.length <= MAX_PURPOSE_LENGTH))
    && value.input && typeof value.input === 'object' && !Array.isArray(value.input);
}

export async function createApprovalServer(confirm) {
  const directory = await mkdtemp(join(tmpdir(), 'pi-approve-'));
  const endpoint = { socketPath: join(directory, 's'), token: randomBytes(32).toString('hex'), ownerPid: process.pid };
  const authorization = Buffer.from(`Bearer ${endpoint.token}`);
  const pending = new Set();
  let closed = false;
  let closing;
  const server = createServer((req, res) => {
    const send = (status, body) => {
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
        res.end(JSON.stringify(body));
      }
    };
    const supplied = Buffer.from(req.headers.authorization ?? '');
    if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization)) {
      send(403, { error: 'Invalid approval session.' });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/approve') {
      send(400, { error: 'Invalid approval request.' });
      return;
    }
    if (closed || pending.size >= MAX_PENDING) {
      send(503, { error: 'Approval channel unavailable or busy.' });
      return;
    }
    const controller = new AbortController();
    pending.add(controller);
    res.once('close', () => { controller.abort(); pending.delete(controller); });
    const handle = async () => {
      let message;
      try { message = await readJson(req); }
      catch { send(400, { error: 'Invalid approval message.' }); return; }
      if (typeof message?.id !== 'string' || message.id.length > 128 || !validInvocation(message.invocation)) {
        send(400, { error: 'Invalid approval invocation.' });
        return;
      }
      if (controller.signal.aborted || closed) return;
      const decision = await confirm(message.invocation, controller.signal);
      if (controller.signal.aborted || closed) return;
      send(200, {
        id: message.id,
        allowed: decision?.allowed === true,
        ...(decision?.allowed === true ? {} : { reason: String(decision?.reason ?? 'Approval not granted.').slice(0, 1024) }),
      });
    };
    handle().catch(() => send(500, { error: 'Human approval failed.' }));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  try {
    await chmod(directory, 0o700);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint.socketPath, () => { server.off('error', reject); resolve(); });
    });
    await chmod(endpoint.socketPath, 0o600);
  } catch (error) {
    server.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  server.on('error', () => {
    closed = true;
    for (const controller of pending) controller.abort();
    server.closeAllConnections();
  });
  return {
    endpoint,
    close() {
      if (closing) return closing;
      closed = true;
      for (const controller of pending) controller.abort();
      closing = new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      }).finally(() => rm(directory, { recursive: true, force: true }));
      return closing;
    },
  };
}

export async function requestApproval(endpoint, invocation, { signal, timeoutMs = 300_000 } = {}) {
  if (!endpoint || typeof endpoint.socketPath !== 'string' || !isAbsolute(endpoint.socketPath)
    || typeof endpoint.token !== 'string' || !/^[a-f0-9]{64}$/.test(endpoint.token)) {
    throw new Error('No valid parent approval channel.');
  }
  const id = randomUUID();
  const body = JSON.stringify({ id, invocation });
  if (Buffer.byteLength(body) > MAX_BYTES) throw new Error('Approval message too large.');
  const deadline = AbortSignal.timeout(timeoutMs);
  const cancellation = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await new Promise((resolve, reject) => {
    const req = request({
      socketPath: endpoint.socketPath, path: '/approve', method: 'POST', agent: false,
      signal: cancellation,
      headers: {
        authorization: `Bearer ${endpoint.token}`,
        'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
      },
    }, resolve);
    req.on('error', reject);
    req.end(body);
  });
  const reply = await readJson(response);
  cancellation.throwIfAborted();
  if (response.statusCode !== 200) throw new Error(`Parent approval failed (${response.statusCode}).`);
  if (reply?.id !== id || typeof reply.allowed !== 'boolean') throw new Error('Invalid parent approval response.');
  if (JSON.stringify({ id, invocation }) !== body) throw new Error('Invocation changed while awaiting approval.');
  return reply.allowed ? { allowed: true } : { allowed: false, reason: String(reply.reason ?? 'Approval not granted.') };
}
