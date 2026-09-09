import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('../../../dot_pi/agent/runtime/capture-tree.py', import.meta.url));
const writeWrapper = (path, code) => writeFile(path, `import os\nimport runpy\nimport sys\n${code}\n`);

test('descriptor capture reads old bytes after an intermediate pathname becomes an external symlink', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-capture-intermediate-race-'));
  const stage = join(parent, 'stage');
  const external = join(parent, 'external');
  const wrapper = join(parent, 'wrapper.py');
  const marker = join(parent, 'swapped');
  try {
    await mkdir(join(stage, 'nested'), { recursive: true });
    await mkdir(external);
    await writeFile(join(stage, 'nested', 'victim'), 'stage bytes');
    await writeFile(join(external, 'victim'), 'external sentinel');
    await writeWrapper(wrapper, `
helper, root, outside, marker = sys.argv[1:]
real_open = os.open
swapped = False
def raced_open(path, flags, *args, **kwargs):
    global swapped
    fd = real_open(path, flags, *args, **kwargs)
    if path == 'nested' and not swapped:
        swapped = True
        os.rename(os.path.join(root, 'nested'), os.path.join(root, 'nested-hidden'))
        os.symlink(outside, os.path.join(root, 'nested'))
        open(marker, 'w').close()
    return fd
os.open = raced_open
sys.argv = [helper, root]
runpy.run_path(helper, run_name='__main__')
`);
    const { stdout } = await execute('python3', ['-B', '-I', wrapper, helper, stage, external, marker]);
    const records = JSON.parse(stdout);
    const victim = records.find(record => record.path === 'nested/victim');
    assert.equal(victim.type, 'file');
    assert.equal(Buffer.from(victim.content, 'base64').toString(), 'stage bytes');
    assert.equal(await readFile(join(external, 'victim'), 'utf8'), 'external sentinel');
    assert.equal(await readFile(marker, 'utf8'), '');
    for (const record of records.filter(record => record.type === 'file')) {
      assert.doesNotMatch(Buffer.from(record.content, 'base64').toString(), /external sentinel/);
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

for (const name of ['symlink', 'fifo']) {
  test(`descriptor capture rejects a final regular file replaced by a ${name}`, async () => {
    const parent = await mkdtemp(join(tmpdir(), `pi-capture-final-${name}-`));
    const stage = join(parent, 'stage');
    const external = join(parent, 'external');
    const wrapper = join(parent, 'wrapper.py');
    try {
      await mkdir(stage);
      await mkdir(external);
      await writeFile(join(stage, 'victim'), 'stage bytes');
      await writeFile(join(external, 'victim'), 'external sentinel');
      const replacement = name === 'symlink'
        ? `os.symlink(os.path.join(outside, 'victim'), os.path.join(root, 'victim'))`
        : `os.mkfifo(os.path.join(root, 'victim'))`;
      await writeWrapper(wrapper, `
helper, root, outside = sys.argv[1:]
real_open = os.open
swapped = False
def raced_open(path, flags, *args, **kwargs):
    global swapped
    if path == 'victim' and not swapped:
        swapped = True
        os.rename(os.path.join(root, 'victim'), os.path.join(root, 'victim-hidden'))
        ${replacement}
    return real_open(path, flags, *args, **kwargs)
os.open = raced_open
sys.argv = [helper, root]
runpy.run_path(helper, run_name='__main__')
`);
      await assert.rejects(
        execute('python3', ['-B', '-I', wrapper, helper, stage, external], { timeout: 3000 }),
        error => {
          assert.equal(error.stdout, '');
          assert.equal(error.killed, false);
          assert.equal(error.signal, null);
          assert.match(error.stderr, name === 'symlink'
            ? /Too many levels of symbolic links/
            : /capture entry is not a regular file: victim/);
          return true;
        },
      );
    } finally { await rm(parent, { recursive: true, force: true }); }
  });
}
