import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cargoEdition } from '../../../dot_pi/agent/runtime/cargo-edition.mjs';

test('Cargo member inherits edition from an explicitly selected sibling workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-cargo-explicit-'));
  try {
    const member = join(root, 'member');
    await mkdir(join(member, 'src'), { recursive: true });
    await mkdir(join(root, 'workspace'));
    await writeFile(join(root, 'Cargo.toml'), '[workspace.package]\nedition = "2015"\n');
    await writeFile(join(root, 'workspace', 'Cargo.toml'), '[workspace]\nmembers = ["../member"]\n[workspace.package]\nedition = "2024"\n');
    await writeFile(join(member, 'Cargo.toml'), '[package]\nname = "member"\nworkspace = "../workspace"\nedition.workspace = true\n');
    assert.equal(await cargoEdition(root, join(member, 'src', 'lib.rs')), '2024');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit Cargo workspace references cannot escape the copied project', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pi-cargo-boundary-'));
  try {
    const project = join(root, 'project');
    const outside = join(root, 'outside');
    await mkdir(join(project, 'src'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, 'Cargo.toml'), '[workspace.package]\nedition = "2024"\n');
    await symlink(outside, join(project, 'linked'));
    for (const selected of ['../outside', outside, 'linked']) {
      await t.test(selected, async () => {
        await writeFile(join(project, 'Cargo.toml'), `[package]\nname = "member"\nworkspace = ${JSON.stringify(selected)}\nedition.workspace = true\n`);
        await assert.rejects(cargoEdition(project, join(project, 'src', 'lib.rs')), /staged project/u);
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
