import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export function requireDsh(profile) {
  const entry = realpathSync(join(profile, 'node_modules/@deepseek-ai/dsh/package.json'));
  return createRequire(entry);
}
