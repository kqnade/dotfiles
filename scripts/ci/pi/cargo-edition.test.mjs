import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cargoEdition } from '../../../dot_pi/agent/runtime/cargo-edition.mjs';

test('Cargo member inherits edition from its ancestor workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-cargo-edition-'));
  try {
    const member = join(root, 'crates', 'member');
    await mkdir(join(member, 'src'), { recursive: true });
    await writeFile(join(root, 'Cargo.toml'), '[workspace]\nmembers = ["crates/member"]\n[workspace.package]\nedition = "2024"\n');
    await writeFile(join(member, 'Cargo.toml'), '[package]\nname = "member"\nversion = "0.1.0"\nedition.workspace = true\n');
    assert.equal(await cargoEdition(root, join(member, 'src', 'lib.rs')), '2024');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
