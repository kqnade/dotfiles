import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credential, listen } from './ipc.mjs';
import { startSession } from './session.mjs';

export async function startBroker(options) {
  const rootId = randomUUID();
  const token = randomBytes(32).toString('hex');
  const socketDirectory = await mkdtemp(join(tmpdir(), 'pi-broker-'));
  const socketPath = join(socketDirectory, 'broker.sock');
  let session;
  let server;
  let closing;
  const close = async () => {
    closing ??= (async () => {
      const errors = [];
      try { await server?.close(); } catch (error) { errors.push(error); }
      try { await session?.close(); } catch (error) { errors.push(error); }
      try { await rm(socketDirectory, { recursive: true, force: true }); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Broker shutdown failed');
    })();
    return closing;
  };
  try {
    session = await startSession({ ...options, rootId });
    server = await listen({
      socketPath, token,
      handle: (method, params, identity) => session.invoke(identity.agentId, method, params),
    });
    return {
      connection: Object.freeze({ socketPath, agentId: rootId, token: credential(token, rootId) }),
      close,
    };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Broker startup and cleanup failed');
    }
    throw error;
  }
}
