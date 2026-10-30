import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const home = process.env.DSH_TEST_WORK_HOME;
assert.ok(home, 'DSH_TEST_WORK_HOME must point to an installed work profile');
for (const surface of ['tui', 'web']) {
  test(`work ${surface} resolves the pinned SDK and matching bundled CLI`, { skip: !home }, async () => {
    const profile = createRequire(join(home, 'profiles', surface, 'package.json'));
    const providerEntry = profile.resolve('@deepseek-ai/dsh-subagent-claude-code');
    const provider = createRequire(providerEntry);
    const sdkEntry = provider.resolve('@anthropic-ai/claude-agent-sdk');
    const sdkRoot = dirname(sdkEntry);
    const metadata = JSON.parse(await readFile(join(sdkRoot, 'package.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(sdkRoot, 'manifest.json'), 'utf8'));
    assert.equal(metadata.version, '0.3.309');
    assert.equal(metadata.claudeCodeVersion, '2.1.309');
    assert.equal(manifest.version, metadata.claudeCodeVersion);
    assert.equal(typeof (await import(pathToFileURL(sdkEntry))).query, 'function');
    await import(pathToFileURL(providerEntry));

    const platform = `${process.platform}-${process.arch}`;
    const native = createRequire(sdkEntry).resolve(`@anthropic-ai/claude-agent-sdk-${platform}/package.json`);
    const nativeMetadata = JSON.parse(await readFile(native, 'utf8'));
    assert.equal(nativeMetadata.version, metadata.version);
    const binary = manifest.platforms[platform];
    assert.ok(binary, `SDK manifest must describe ${platform}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(join(dirname(native), binary.binary))) hash.update(chunk);
    assert.equal(hash.digest('hex'), binary.checksum);
  });
}
