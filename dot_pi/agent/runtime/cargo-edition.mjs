import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);

function isWithin(root, path) {
  const distance = relative(root, path);
  return !isAbsolute(distance) && distance !== '..' && !distance.startsWith(`..${sep}`);
}

function validateEdition(edition) {
  if (!['2015', '2018', '2021', '2024'].includes(edition)) {
    throw new Error('Cargo edition must be 2015, 2018, 2021, or 2024');
  }
  return edition;
}

export async function cargoEdition(workspace, filePath) {
  let inherited = false;
  for (let directory = dirname(filePath); ; directory = dirname(directory)) {
    const distance = relative(workspace, directory);
    if (isAbsolute(distance) || distance === '..' || distance.startsWith(`..${sep}`)) break;
    let text;
    try {
      text = await readFile(join(directory, 'Cargo.toml'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (text !== undefined) {
      const root = process.env.PI_PACKAGE_ROOT;
      if (!root || !isAbsolute(root)) throw new Error('PI_PACKAGE_ROOT must be an absolute path');
      const { parse } = require(join(root, 'node_modules', 'smol-toml'));
      const manifest = parse(text);
      if (!inherited && manifest.package) {
        const edition = manifest.package.edition ?? '2015';
        if (edition?.workspace !== true) return validateEdition(edition);
        if (manifest.package.workspace !== undefined) {
          const selected = manifest.package.workspace;
          if (typeof selected !== 'string' || isAbsolute(selected)) {
            throw new Error('Cargo workspace must be a relative path inside the staged project');
          }
          const path = resolve(directory, selected, 'Cargo.toml');
          if (!isWithin(workspace, path)) throw new Error('Cargo workspace escapes the staged project');
          const canonical = await realpath(path);
          if (!isWithin(await realpath(workspace), canonical)) {
            throw new Error('Cargo workspace escapes the staged project');
          }
          const target = parse(await readFile(canonical, 'utf8'));
          return validateEdition(target.workspace?.package?.edition);
        }
        inherited = true;
      }
      if (inherited && manifest.workspace) {
        return validateEdition(manifest.workspace.package?.edition);
      }
    }
    if (directory === workspace) break;
  }
  if (inherited) throw new Error('Cargo workspace edition is unavailable inside the staged project');
  return undefined;
}
