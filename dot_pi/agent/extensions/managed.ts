import { Type } from 'typebox';
import { writeSync } from 'node:fs';

import { installModelGuard } from '../runtime/guard.mjs';
import { connect } from '../runtime/ipc.mjs';
import { modelFor } from '../runtime/models.mjs';

const REQUIRED_ENVIRONMENT = [
  'PI_BROKER_SOCKET',
  'PI_AGENT_ID',
  'PI_AGENT_TOKEN',
  'PI_AGENT_ROLE',
];

const ROLE_PROMPTS = Object.freeze({
  root: [
    'You are Sol, the root coding agent.',
    'Use the managed read, edit, and write tools for repository access.',
    'For complex or large work, delegate exactly one task to Astra; Astra coordinates its own Sol, Luna, and Spark workers.',
    'Keep delegated tasks scoped with explicit paths and review their results before continuing.',
  ].join(' '),
  sol: [
    'You are Sol, a delegated implementation agent.',
    'Use the managed read, edit, and write tools for repository access and complete the assigned task within its explicit paths.',
    'If the task becomes too complex for your assigned scope, use the managed escalate tool with a concise reason to return control to the existing waiting Astra, then finish your response without further edits.',
    'Return clear results to Astra and do not create further workers.',
  ].join(' '),
  astra: [
    'You are Astra, the coordinating implementation agent.',
    'Use the managed read, edit, and write tools for repository access.',
    'Delegate independent work to Sol, Luna, or Spark according to the task, scope, and required depth, then integrate and verify their results.',
  ].join(' '),
  luna: [
    'You are Luna, a leaf implementation agent.',
    'Use the managed read, edit, and write tools for repository access and complete the assigned task within its explicit paths.',
    'You cannot delegate; return evidence and results to your caller.',
  ].join(' '),
  spark: [
    'You are Spark, a leaf implementation agent.',
    'Use the managed read, edit, and write tools for repository access and complete the assigned task within its explicit paths.',
    'You cannot delegate; return evidence and results to your caller.',
  ].join(' '),
});

const text = (value) => {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
};

const toolResult = (value) => ({
  content: [{ type: 'text', text: text(value) }],
  details: value,
});

const requireEnvironment = () => {
  for (const name of REQUIRED_ENVIRONMENT) {
    if (typeof process.env[name] !== 'string' || process.env[name].length === 0) {
      throw new Error(`${name} is required`);
    }
  }

  const role = process.env.PI_AGENT_ROLE;
  modelFor(role);
  return Object.freeze({
    socketPath: process.env.PI_BROKER_SOCKET,
    agentId: process.env.PI_AGENT_ID,
    token: process.env.PI_AGENT_TOKEN,
    role,
  });
};

const rejectAborted = (signal) => {
  if (signal?.aborted) throw new Error('Managed tool execution was cancelled');
};

const failClosed = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    writeSync(2, `Managed broker permit failed: ${message}\n`);
  } finally {
    process.exit(78);
  }
  throw error;
};

const readParameters = Type.Object({
  path: Type.String({ description: 'Repository-relative file path to read' }),
});

const writeParameters = Type.Object({
  path: Type.String({ description: 'Repository-relative file path to write' }),
  text: Type.String({ description: 'Complete replacement file contents' }),
  expectedHash: Type.Union([
    Type.String({ description: 'SHA-256 hash of the expected file contents' }),
    Type.Null(),
  ], { description: 'Expected preimage hash, or null for a create-only write' }),
});

const editParameters = Type.Object({
  path: Type.String({ description: 'Repository-relative file path to edit' }),
  oldText: Type.String({ description: 'One unique literal occurrence to replace' }),
  newText: Type.String({ description: 'Replacement text for the unique occurrence' }),
  expectedHash: Type.String({ description: 'SHA-256 hash of the expected file contents' }),
});

const escalationParameters = Type.Object({
  reason: Type.String({ description: 'Why the existing Astra should resume this work' }),
});

const delegateParameters = Type.Object({
  tasks: Type.Array(Type.Object({
    role: Type.String({ description: 'Child role: astra, sol, luna, or spark' }),
    task: Type.String({ description: 'Task instructions for the child agent' }),
    paths: Type.Array(Type.String(), { description: 'Repository-relative paths assigned to the child' }),
  })),
});

export default function managed(pi) {
  const environment = requireEnvironment();
  const { role } = environment;
  installModelGuard(pi, role);

  let client;
  let connectionPromise;
  let closePromise;

  const open = async () => {
    if (client) return client;
    if (closePromise) {
      await closePromise;
      closePromise = undefined;
    }
    if (client) return client;
    connectionPromise ??= connect(environment)
      .then((connected) => {
        client = connected;
        return connected;
      })
      .finally(() => {
        connectionPromise = undefined;
      });
    return connectionPromise;
  };

  const call = async (method, params, signal) => {
    rejectAborted(signal);
    const connected = client;
    if (!connected) throw new Error('Managed broker is not connected');
    return connected.call(method, params, {
      signal,
      timeoutMs: method === 'delegate' ? null : undefined,
    });
  };

  const permit = async () => {
    const connected = client;
    if (!connected) throw new Error('Managed broker is not connected');
    const admitted = await connected.call('permit');
    if (admitted?.id !== environment.agentId || admitted?.role !== role) {
      throw new Error('Broker permit does not match the agent identity');
    }
    modelFor(admitted.role);
    return admitted;
  };

  pi.on('session_start', async () => {
    await open();
  });

  pi.on('session_shutdown', async () => {
    if (closePromise) return closePromise;
    const pending = connectionPromise;
    const connected = client;
    client = undefined;
    closePromise = (async () => {
      const resource = connected ?? (pending ? await pending : undefined);
      if (resource) await resource.close();
    })();
    return closePromise;
  });

  pi.on('before_provider_request', async () => {
    try {
      await permit();
    } catch (error) {
      failClosed(error);
    }
  });

  pi.on('before_agent_start', (event) => ({
    systemPrompt: `${event.systemPrompt ?? ''}${event.systemPrompt ? '\n\n' : ''}${ROLE_PROMPTS[role]}`,
  }));

  pi.on('user_bash', () => ({
    result: {
      output: 'Shell commands are unavailable; use managed tools.',
      exitCode: 1,
      cancelled: false,
      truncated: false,
    },
  }));

  pi.registerTool({
    name: 'read',
    label: 'Managed Read',
    description: 'Read a repository file through the authenticated supervisor.',
    promptSnippet: 'Read a repository file through the supervisor',
    parameters: readParameters,
    async execute(_toolCallId, params, signal) {
      return toolResult(await call('read', { path: params.path }, signal));
    },
  });

  pi.registerTool({
    name: 'write',
    label: 'Managed Write',
    description: 'Write a repository file through the authenticated supervisor with an expected preimage hash.',
    promptSnippet: 'Write a repository file through the supervisor with a preimage hash',
    parameters: writeParameters,
    async execute(_toolCallId, params, signal) {
      return toolResult(await call('write', {
        path: params.path,
        text: params.text,
        expectedHash: params.expectedHash,
      }, signal));
    },
  });

  pi.registerTool({
    name: 'edit',
    label: 'Managed Edit',
    description: 'Replace one unique literal occurrence through the authenticated supervisor with an expected preimage hash.',
    promptSnippet: 'Edit one unique literal through the supervisor with a preimage hash',
    parameters: editParameters,
    async execute(_toolCallId, params, signal) {
      return toolResult(await call('edit', {
        path: params.path,
        oldText: params.oldText,
        newText: params.newText,
        expectedHash: params.expectedHash,
      }, signal));
    },
  });

  pi.registerTool({
    name: 'escalate',
    label: 'Managed Escalate',
    description: 'Return a delegated Sol task to its waiting Astra with a concise reason.',
    promptSnippet: 'Escalate the delegated task to the waiting Astra',
    parameters: escalationParameters,
    async execute(_toolCallId, params, signal) {
      return toolResult(await call('escalate', { reason: params.reason }, signal));
    },
  });

  pi.registerTool({
    name: 'delegate',
    label: 'Managed Delegate',
    description: 'Delegate explicitly scoped work to a permitted child role through the supervisor.',
    promptSnippet: 'Delegate explicitly scoped work through the supervisor',
    parameters: delegateParameters,
    async execute(_toolCallId, params, signal) {
      return toolResult(await call('delegate', { tasks: params.tasks }, signal));
    },
  });
}
