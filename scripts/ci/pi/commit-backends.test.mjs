import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generatePiCommitMessage } from '../../pi/commit-backends.mjs';

test('the Pi commit backend uses isolated no-tools Sol and validates its response', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-commit-backend-'));
  try {
    const result = await generatePiCommitMessage({
      cwd, piEntry: fileURLToPath(new URL('./fixtures/commit-pi.mjs', import.meta.url)),
      stagedDiff: '+specific staged content', recentLog: '📝 docs: describe setup',
    });
    assert.equal(result, '✨ feat: add managed startup');
    const observed = JSON.parse(await readFile(join(cwd, 'request.json'), 'utf8'));
    assert.equal(observed.model, 'gpt-5.6-sol');
    assert.equal(observed.effort, 'medium');
    assert.match(observed.prompt, /specific staged content/);
    assert.match(observed.prompt, /describe setup/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
