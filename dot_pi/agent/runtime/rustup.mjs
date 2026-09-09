import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';

export async function resolveRustfmt({ ownership, lease, cwd, path, command, signal }, runStaged) {
  const home = await realpath(process.env.RUSTUP_HOME || join(homedir(), '.rustup'));
  const toolchains = join(home, 'toolchains');
  const readPaths = [command];
  const readLiterals = new Set([home, toolchains, join(home, 'settings.toml'), join(home, 'state.toml')]);
  const candidates = new Set();
  let names;
  try { names = await readdir(toolchains); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    names = [];
  }
  for (const name of names) {
    const directory = join(toolchains, name);
    readLiterals.add(directory);
    try {
      readLiterals.add(await realpath(directory));
      const executable = await realpath(join(directory, 'bin', 'rustfmt'));
      const entry = await stat(executable);
      if (!entry.isFile() || (entry.mode & 0o111) === 0) continue;
      candidates.add(executable);
      readPaths.push(executable);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  for (let directory = cwd; ; directory = dirname(directory)) {
    if (directory !== dirname(directory)) readLiterals.add(directory);
    readLiterals.add(join(directory, 'rust-toolchain'));
    readLiterals.add(join(directory, 'rust-toolchain.toml'));
    if (directory === dirname(directory)) break;
  }
  const environment = [`RUSTUP_HOME=${home}`, 'RUSTUP_AUTO_INSTALL=0'];
  if (process.env.RUSTUP_TOOLCHAIN) environment.push(`RUSTUP_TOOLCHAIN=${process.env.RUSTUP_TOOLCHAIN}`);
  if (process.platform === 'darwin') readPaths.push('/private/etc/ssl/openssl.cnf');
  const etc = await realpath('/etc');
  readLiterals.add('/etc');
  readLiterals.add(etc);
  readLiterals.add(join(etc, 'rustup'));
  readLiterals.add(join(etc, 'rustup', 'settings.toml'));
  const result = await runStaged({
    ownership, lease, cwd, files: [relative(cwd, path)], signal,
    command: '/usr/bin/env',
    args: [...environment, '/bin/sh', '-c', 'cd "$1" && exec "$2" which rustfmt', 'rustfmt-resolver', cwd, command],
    readPaths, readLiterals: [...readLiterals],
  });
  const match = /^([^\r\n]+)\n?$/u.exec(result.stdout);
  const selected = match && isAbsolute(match[1]) ? await realpath(match[1]) : undefined;
  if (!candidates.has(selected)) {
    throw Object.assign(new Error('rustup did not select an installed rustfmt executable'), { code: 'FORMATTER_MISSING' });
  }
  return selected;
}
