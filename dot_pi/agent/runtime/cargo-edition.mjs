import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

const require = createRequire(import.meta.url);

export async function cargoEdition(workspace, filePath) {
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
      if (manifest.package) {
        const edition = manifest.package.edition ?? '2015';
        if (!['2015', '2018', '2021', '2024'].includes(edition)) {
          throw new Error('Cargo package edition must be 2015, 2018, 2021, or 2024');
        }
        return edition;
      }
    }
    if (directory === workspace) break;
  }
  return undefined;
}
