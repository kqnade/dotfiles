import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

test('a swallowed provider hook exception cannot allow a mismatched request', () => {
  const guard = new URL('../../../dot_pi/agent/runtime/guard.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { installModelGuard } from ${JSON.stringify(guard)};
    let handler;
    installModelGuard({ on(name, callback) { handler = callback; } }, 'luna');
    try {
      await handler({payload:{model:'gpt-5.6-luna',reasoning:{effort:'high'}}},
        {model:{provider:'openai-codex',id:'gpt-5.6-luna'},thinkingLevel:'max'});
    } catch {}
    process.stdout.write('REQUEST SENT');
  `], { encoding: 'utf8' });
  assert.equal(child.status, 78, child.stderr);
  assert.equal(child.stdout, '');
  assert.match(child.stderr, /effort mismatch/);
});
