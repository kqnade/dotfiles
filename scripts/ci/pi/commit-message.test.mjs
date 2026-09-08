import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dispatchCommitMessage } from '../../../scripts/pi/commit-message.mjs';

test('dispatch routes GitHub remotes and validates before staged diff transmission', async () => {
  const routed = [];
  const supported = [
    ['git@github.com:kqnade/dotfiles.git', 'pi'],
    ['ssh://git@github.com/livesense-inc/example.git', 'claude'],
    ['https://github.com/jobtalk/example', 'claude'],
  ];

  for (const [remoteUrl, backend] of supported) {
    const result = await dispatchCommitMessage({
      remoteUrl,
      readStagedDiff: async () => 'staged diff',
      readRecentLog: async () => 'recent history',
      generate: async (request) => {
        routed.push(request);
        return '✨ feat: update commit backend';
      },
    });
    assert.equal(result, '✨ feat: update commit backend');
  }

  assert.deepEqual(routed.map(({ route }) => route.backend), ['pi', 'claude', 'claude']);
  assert.deepEqual(routed[0].route, {
    backend: 'pi',
    owner: 'kqnade',
    repository: 'dotfiles',
    provider: 'openai-codex',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    noTools: true,
    auth: 'chatgpt-oauth',
  });
  assert.deepEqual(routed[1].route, {
    backend: 'claude',
    owner: 'livesense-inc',
    repository: 'example',
  });
  assert.equal(routed[0].stagedDiff, 'staged diff');
  assert.equal(routed[0].recentLog, 'recent history');

  for (const remoteUrl of [
    'git@gitlab.com:owner/project.git',
    'ssh://git@github.com/owner/project/extra.git',
    'https://github.com/owner',
    'github.com:owner/project.git',
    'https://github.com.evil.example/owner/project.git',
    'https://github.com/livesense-inc/../kqnade/project.git',
    'https://github.com/livesense-inc/./project.git',
    'https://github.com/livesense-inc\\kqnade/project.git',
    'https://github.com/livesense-inc/project.git\n',
    'https://github.com/livesense-inc/pro\u0000ject.git',
  ]) {
    const events = [];
    await assert.rejects(
      dispatchCommitMessage({
        remoteUrl,
        readStagedDiff: async () => {
          events.push('staged diff');
          return 'must stay private';
        },
        readRecentLog: async () => {
          events.push('recent history');
          return 'must stay private';
        },
        generate: async () => {
          events.push('backend');
          return 'must stay private';
        },
      }),
      /unsupported|malformed|invalid/i,
    );
    assert.deepEqual(events, []);
  }
});

test('dispatch rejects empty and error backend results', async () => {
  for (const generated of ['', '   ', 'Error: provider unavailable']) {
    await assert.rejects(
      dispatchCommitMessage({
        remoteUrl: 'https://github.com/kqnade/dotfiles.git',
        readStagedDiff: async () => 'staged diff',
        readRecentLog: async () => 'recent history',
        generate: async () => generated,
      }),
      /invalid|empty|error/i,
    );
  }
});
