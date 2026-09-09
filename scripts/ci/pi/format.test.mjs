import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { Ownership } from '../../../dot_pi/agent/runtime/ownership.mjs';
import { formatFile as managedFormatFile } from '../../../dot_pi/agent/runtime/format.mjs';
import { runStagedProcess } from '../../../dot_pi/agent/runtime/staged-process.mjs';
import { sandboxEnvironment } from '../../../dot_pi/agent/runtime/sandbox-env.mjs';

// The portable fixture substitutes only the unavailable OS boundary.
const runStaged = invocation => runStagedProcess(invocation, process.platform === 'darwin' ? undefined :
  async ({ workspace, command, args }) => ({
    command, args, cwd: workspace, env: sandboxEnvironment(workspace),
  }));
const formatFile = options => managedFormatFile(options, runStaged);

test('Darwin formats and publishes a Go file with the installed gofmt', {
  skip: process.platform === 'darwin' ? false : 'requires macOS Seatbelt',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-gofmt-'));
  try {
    const target = join(root, 'main.go');
    await writeFile(target, 'package main\nfunc main(){println("hello")}\n');
    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['main.go']);
    const result = await managedFormatFile({ ownership, lease, cwd: root, path: 'main.go' });
    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(target, 'utf8'), 'package main\n\nfunc main() { println("hello") }\n');
    const repeated = await managedFormatFile({ ownership, lease, cwd: root, path: 'main.go' });
    assert.equal(repeated.status, 'unchanged');
    await writeFile(target, 'package main\nfunc invalid(\n');
    await assert.rejects(managedFormatFile({ ownership, lease, cwd: root, path: 'main.go' }), { code: 'PROCESS_FAILED' });
    assert.equal(await readFile(target, 'utf8'), 'package main\nfunc invalid(\n');
    await ownership.drain(lease);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const writeFormatter = async (root, name, script) => {
  const bin = join(root, 'node_modules', '.bin');
  await mkdir(bin, { recursive: true });
  const command = join(bin, name);
  await writeFile(command, `#!/usr/bin/env node\n${script}\n`, { mode: 0o755 });
};

test('formatter publication preserves an external edit after staged execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-conflict-'));
  try {
    const target = join(root, 'app.js');
    await writeFile(target, 'const x=1;');
    await writeFile(join(root, 'biome.json'), '{}');
    await writeFormatter(root, 'biome', `process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('const x = 1;\\n'));`);
    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['app.js']);
    await assert.rejects(managedFormatFile({ ownership, lease, cwd: root, path: 'app.js' }, async invocation => {
      const result = await runStaged(invocation);
      await writeFile(target, 'external edit');
      return result;
    }), { code: 'PREIMAGE_MISMATCH' });
    assert.equal(await readFile(target, 'utf8'), 'external edit');
    await ownership.drain(lease);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('formatter cancellation after staged execution prevents publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-cancel-'));
  const controller = new AbortController();
  try {
    const target = join(root, 'app.js');
    await writeFile(target, 'const x=1;');
    await writeFile(join(root, 'biome.json'), '{}');
    await writeFormatter(root, 'biome', `process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('const x = 1;\\n'));`);
    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['app.js']);
    await assert.rejects(managedFormatFile({ ownership, lease, cwd: root, path: 'app.js', signal: controller.signal }, async invocation => {
      const result = await runStaged(invocation);
      controller.abort();
      return result;
    }), { code: 'ABORT_ERR' });
    assert.equal(await readFile(target, 'utf8'), 'const x=1;');
    await ownership.drain(lease);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('format file through stdout formatter, keep unchanged targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-success-'));
  try {
    const project = join(root, 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'biome.json'), '{"files": {"./": {"formatter": {"enabled": true}}}}');
    await writeFile(join(project, 'app.js'), 'export const x=UNFORMATTED;\n');
    await writeFile(join(project, 'unchanged.js'), 'const sibling = 1;\n');

    await writeFormatter(project, 'biome', `
      const chunks = [];
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => {
        const input = Buffer.concat(chunks).toString('utf8');
        process.stdout.write(input.replace('UNFORMATTED', 'FORMATTED'));
      });
    `);

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);

    const result = await formatFile({
      ownership,
      lease,
      path: 'project/app.js',
      cwd: root,
    });

    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(join(project, 'app.js'), 'utf8'), 'export const x=FORMATTED;\n');
    assert.equal(await readFile(join(project, 'unchanged.js'), 'utf8'), 'const sibling = 1;\n');
    assert.equal(result.path, 'project/app.js');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('format nested file with file-level lease using ancestor formatter config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-success-nested-'));
  try {
    const project = join(root, 'project');
    const source = join(project, 'src');
    await mkdir(source, { recursive: true });
    const target = join(source, 'app.js');
    await writeFile(join(project, 'biome.json'), '{"files": {"./": {"formatter": {"enabled": true}}}}');
    await writeFile(target, 'export const x=UNFORMATTED;\n');
    const canonicalTarget = await realpath(target);

    await writeFormatter(project, 'biome', `
      const args = process.argv.slice(2);
      const expected = ${JSON.stringify(canonicalTarget)};
      const stdinPathIndex = args.indexOf('--stdin-file-path');
      const stagedPath = args[stdinPathIndex + 1];
      const fs = require('node:fs');
      const path = require('node:path');
      if (stdinPathIndex === -1 || stagedPath === expected
        || stagedPath !== path.join(process.cwd(), 'project/src/app.js')
        || fs.readFileSync(path.join(process.cwd(), 'project/biome.json'), 'utf8') !== '{"files": {"./": {"formatter": {"enabled": true}}}}') {
        process.exit(1);
      }
      const chunks = [];
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => {
        const input = Buffer.concat(chunks).toString('utf8');
        process.stdout.write(input.replace('UNFORMATTED', 'FORMATTED'));
      });
    `);

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', [join('project', 'src', 'app.js')]);

    const result = await formatFile({
      ownership,
      lease,
      path: 'project/src/app.js',
      cwd: root,
    });

    assert.equal(result.status, 'formatted');
    assert.equal(await readFile(target, 'utf8'), 'export const x=FORMATTED;\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid package.json for formatter config is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-invalid-package-json-'));
  try {
    const project = join(root, 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'package.json'), '{ invalid-json }');
    await writeFile(join(project, 'app.js'), 'export const x=1;\n');
    await writeFormatter(project, 'prettier', `
      process.stdout.write('');
    `);

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);

    await assert.rejects(
      formatFile({
        ownership,
        lease,
        path: 'project/app.js',
        cwd: root,
      }),
      /Expected property name|Unexpected token/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skip JavaScript when no formatter config is available', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-skip-js-'));
  try {
    const project = join(root, 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'app.js'), 'const value = 1;\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);

    const result = await formatFile({
      ownership,
      lease,
      path: 'project/app.js',
      cwd: root,
    });

    assert.deepEqual(result, {
      status: 'skipped',
      path: 'project/app.js',
      reason: 'missing_js_formatter_config',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skip Python when Ruff config is not present', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-skip-py-'));
  try {
    const project = join(root, 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'script.py'), 'x = 1\n');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);

    const result = await formatFile({
      ownership,
      lease,
      path: 'project/script.py',
      cwd: root,
    });

    assert.deepEqual(result, {
      status: 'skipped',
      path: 'project/script.py',
      reason: 'missing_python_formatter_config',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reject when a configured formatter cannot be resolved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-missing-'));
  const originalPath = process.env.PATH;
  const emptyBin = join(root, 'empty-bin');
  try {
    const project = join(root, 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'pyproject.toml'), '[tool.ruff]\n');
    await writeFile(join(project, 'script.py'), 'x = 1\n');
    await mkdir(emptyBin, { recursive: true });
    process.env.PATH = emptyBin;

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);

    await assert.rejects(
      formatFile({
        ownership,
        lease,
        path: 'project/script.py',
        cwd: root,
      }),
      { code: 'FORMATTER_MISSING' },
    );
  } finally {
    process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});

test('reject out-of-scope targets before formatter launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-format-scope-'));
  try {
    const project = join(root, 'project');
    const outside = join(root, 'outside');
    await mkdir(project, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(project, 'biome.json'), '{}');
    await writeFile(join(outside, 'note.js'), 'const x = 1;\n');

    await writeFormatter(root, 'biome', `
      const fs = require('fs');
      fs.writeFileSync(${JSON.stringify(resolve(root, 'formatter.invoked'))}, 'called');
    `);

    const side = join(root, 'formatter.invoked');
    await writeFile(side, '0');

    const ownership = new Ownership({ cwd: root });
    const lease = ownership.claim('formatter', ['project']);

    await assert.rejects(
      formatFile({
        ownership,
        lease,
        path: 'outside/note.js',
        cwd: root,
      }),
      { code: 'OUT_OF_SCOPE' },
    );

    const marker = await readFile(side, 'utf8');
    assert.equal(marker, '0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
