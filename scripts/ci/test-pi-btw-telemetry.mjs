import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTelemetry } from '../../dot_pi/agent/extensions/lib/btw-session.mjs';

test('side sessions keep their context and load telemetry, including shutdown', async () => {
  const observed = [];
  const originalLoader = { getExtensions: () => ({ extensions: [] }), getSystemPrompt: () => 'PRIVATE_CONTEXT' };
  const extensionResult = { extensions: ['telemetry'] };
  const session = {
    bindExtensions: async args => observed.push(['bind', args.mode]),
    extensionRunner: { emit: async event => observed.push(['event', event.type]) },
    dispose: () => observed.push(['dispose']),
  };
  let factory;
  const create = withTelemetry({
    createSession: async options => {
      assert.equal(options.resourceLoader.getSystemPrompt(), 'PRIVATE_CONTEXT');
      assert.equal(options.resourceLoader.getExtensions(), extensionResult);
      assert.deepEqual(options.tools, ['read']);
      return { session };
    },
    createLoader: options => {
      assert.equal(options.noExtensions, true);
      factory = options.extensionFactories[0].factory;
      return { reload: async () => {}, getExtensions: () => extensionResult };
    },
    telemetry: (_pi, options) => observed.push(['conversation', options.conversation]),
  });
  const result = await create({ resourceLoader: originalLoader, tools: ['read'] });
  factory({});
  await result.session.dispose();
  assert.deepEqual(observed, [['bind', 'rpc'], ['conversation', 'btw'], ['event', 'session_shutdown'], ['dispose']]);
});
