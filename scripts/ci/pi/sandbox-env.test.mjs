import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

const SENTINEL_KEYS = [
  'PI_BROKER_SOCKET',
  'PI_AGENT_ID',
  'PI_AGENT_TOKEN',
  'PI_AGENT_ROLE',
  'OPENAI_API_KEY',
  'SSH_AUTH_SOCK',
  'NODE_OPTIONS',
  'BASH_ENV',
  'PYTHONPATH',
];

test('sandbox environment exposes only fixed safe values', () => {
  const workspace = '/tmp/pi-sandbox-workspace';
  const previous = Object.fromEntries(SENTINEL_KEYS.map(key => [key, {
    present: Object.hasOwn(process.env, key),
    value: process.env[key],
  }]));
  try {
    for (const key of SENTINEL_KEYS) process.env[key] = `sentinel-${key}`;

    const environment = sandboxEnvironment(workspace);
    assert.deepEqual(environment, {
      HOME: workspace,
      TMPDIR: workspace,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      LANG: 'C',
      LC_ALL: 'C',
    });
    assert.ok(Object.isFrozen(environment));
    assert.notEqual(environment, sandboxEnvironment(workspace));
  } finally {
    for (const key of SENTINEL_KEYS) {
      if (previous[key].present) process.env[key] = previous[key].value;
      else delete process.env[key];
    }
  }
});

test('sandbox environment rejects relative, unnormalized, and NUL-containing workspaces', () => {
  assert.throws(() => sandboxEnvironment('relative/workspace'), /absolute/u);
  assert.throws(() => sandboxEnvironment('/tmp/workspace/../other'), /normalized/u);
  assert.throws(() => sandboxEnvironment('/tmp/workspace\0unsafe'), /NUL/u);
});
