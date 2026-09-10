import { sha256 } from './ownership.mjs';
import { compareCapturedTrees } from './tree-changes.mjs';

// Publication is sequential; failures report paths already applied.
export async function publishCapturedFiles({ ownership, lease, baseline, captured, signal }) {
  const changes = compareCapturedTrees(baseline, captured);
  for (const { before, after } of changes) {
    if ((before !== null && before.type !== 'file') || (after !== null && after.type !== 'file')
      || (before !== null && after !== null && before.mode !== after.mode)
      || (before === null && after.mode !== 0o600)) {
      throw Object.assign(new Error('file publication requires regular files without mode changes'), {
        code: 'UNSUPPORTED_CAPTURED_CHANGE',
      });
    }
  }
  return ownership.run(lease, async () => {
    const published = [];
    try {
      for (const { path, before, after } of changes) {
        if (signal?.aborted) throw Object.assign(new Error('file publication aborted'), { code: 'ABORT_ERR' });
        const expectedHash = before === null ? null : sha256(Buffer.from(before.content, 'base64'));
        if (after === null) await ownership.remove(lease, path, { expectedHash });
        else await ownership.write(lease, path, Buffer.from(after.content, 'base64'), { expectedHash });
        published.push(path);
      }
      return Object.freeze(published);
    } catch (error) {
      error.publishedPaths = Object.freeze([...published]);
      throw error;
    }
  });
}
