import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { authorizeRepository } from '../../../dot_pi/agent/runtime/repository.mjs';

const git = promisify(execFile);

test('repository authorization rejects a Git URL rewrite into a work namespace', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-repository-rewrite-'));
  try {
    await git('git', ['init', cwd]);
    await git('git', ['-C', cwd, 'config', 'remote.origin.url', 'https://github.com/example/synthetic-fixture.git']);
    await git('git', ['-C', cwd, 'config', 'url.https://github.com/livesense-inc/.insteadOf', 'https://github.com/example/']);
    await assert.rejects(authorizeRepository({ cwd }), /requires the approved Claude account/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
