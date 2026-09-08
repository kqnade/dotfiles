import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyPayload } from '../../../dot_pi/agent/runtime/models.mjs';

test('Luna payloads cannot silently reduce max effort', () => {
  assert.throws(() => verifyPayload('luna', {
    model: 'gpt-5.6-luna', reasoning: { effort: 'high' },
  }), /effort mismatch/);
  assert.doesNotThrow(() => verifyPayload('luna', {
    model: 'gpt-5.6-luna', reasoning: { effort: 'max' },
  }));
});
