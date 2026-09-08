import { modelFor } from '../../dot_pi/agent/runtime/models.mjs';
import { parseGitHubRemote } from '../../dot_pi/agent/runtime/github.mjs';

export { parseGitHubRemote };

const APPROVED_CLAUDE_OWNERS = new Set(['livesense-inc', 'jobtalk']);
const GITMOJI_TYPES = Object.freeze([
  ['✨', 'feat'],
  ['🐛', 'fix'],
  ['♻️', 'refactor'],
  ['📝', 'docs'],
  ['✅', 'test'],
  ['🔧', 'chore'],
  ['⚡️', 'perf'],
  ['👷', 'ci'],
  ['🎨', 'style'],
  ['⏪️', 'revert'],
  ['📦', 'build'],
]);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMMIT_MESSAGE_PATTERN = new RegExp(
  `^(?:${GITMOJI_TYPES.map(([emoji, type]) => `${escapeRegExp(emoji)} ${type}`).join('|')})` +
  String.raw`(?:\([A-Za-z0-9._/-]+\))?: [^\s].*$`,
  'u',
);

export function routeGitHubRemote(remoteUrl) {
  const repository = parseGitHubRemote(remoteUrl);
  if (APPROVED_CLAUDE_OWNERS.has(repository.owner)) {
    return Object.freeze({ backend: 'claude', ...repository });
  }

  const model = modelFor('sol');
  return Object.freeze({
    backend: 'pi',
    ...repository,
    provider: model.provider,
    model: model.id,
    effort: model.effort,
    noTools: true,
    auth: 'chatgpt-oauth',
  });
}

export function validateCommitMessage(value) {
  if (typeof value !== 'string') throw new TypeError('generated commit message must be text');
  const message = value.trim();
  if (!message) throw new Error('generated commit message is empty');
  if (/[\u0000-\u001f\u007f]/.test(message) || message.includes('\n')) {
    throw new Error('generated commit message must be one line');
  }
  if (Array.from(message).length > 72) {
    throw new Error('generated commit message exceeds 72 characters');
  }
  if (!COMMIT_MESSAGE_PATTERN.test(message)) {
    throw new Error('generated commit message is not a valid gitmoji conventional message');
  }
  return message;
}

export async function dispatchCommitMessage({
  remoteUrl,
  readStagedDiff,
  readRecentLog,
  generate,
} = {}) {
  const route = routeGitHubRemote(remoteUrl);
  if (typeof readStagedDiff !== 'function') {
    throw new TypeError('readStagedDiff must be a function');
  }
  if (typeof readRecentLog !== 'function') {
    throw new TypeError('readRecentLog must be a function');
  }
  if (typeof generate !== 'function') throw new TypeError('generate must be a function');

  const stagedDiff = await readStagedDiff();
  const recentLog = await readRecentLog();
  return validateCommitMessage(await generate({ route, stagedDiff, recentLog }));
}
