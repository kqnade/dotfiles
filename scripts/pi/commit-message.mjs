import { modelFor } from '../../dot_pi/agent/runtime/models.mjs';

const GITHUB_HOST = 'github.com';
const APPROVED_CLAUDE_OWNERS = new Set(['livesense-inc', 'jobtalk']);
const OWNER_PATTERN = /^(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,37}[A-Za-z0-9])$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+$/;
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

function invalidRemote(reason) {
  throw new Error(`invalid or unsupported GitHub remote: ${reason}`);
}

function parseRepositoryPath(path) {
  let repositoryPath = path;
  if (repositoryPath.endsWith('/')) repositoryPath = repositoryPath.slice(0, -1);
  if (repositoryPath.endsWith('.git')) repositoryPath = repositoryPath.slice(0, -4);

  const parts = repositoryPath.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    invalidRemote('repository path must contain one owner and repository');
  }

  const [owner, repository] = parts;
  if (!OWNER_PATTERN.test(owner)) invalidRemote('repository owner is malformed');
  if (
    !REPOSITORY_PATTERN.test(repository) ||
    repository === '.' ||
    repository === '..'
  ) {
    invalidRemote('repository name is malformed');
  }

  return Object.freeze({
    owner: owner.toLowerCase(),
    repository,
  });
}

function parseScpRemote(remoteUrl) {
  const match = /^git@github\.com:(?<path>[^\s?#]+)$/i.exec(remoteUrl);
  return match ? match.groups.path : null;
}

function parseUrlRemote(remoteUrl) {
  const schemeEnd = remoteUrl.indexOf('://');
  const authority = remoteUrl.slice(schemeEnd + 3).match(/^[^/?#]*/)?.[0] ?? '';
  const pathStart = schemeEnd + 3 + authority.length;
  const pathEnd = remoteUrl.search(/[?#]/);
  const rawPath = remoteUrl.slice(pathStart, pathEnd === -1 ? remoteUrl.length : pathEnd);
  if (/(?:^|\/)\.\.?(?=\/|$)/.test(rawPath)) {
    invalidRemote('dot segments are unsupported');
  }

  let url;
  try {
    url = new URL(remoteUrl);
  } catch {
    invalidRemote('remote URL is malformed');
  }

  const protocol = url.protocol.toLowerCase();
  if (url.hostname.toLowerCase() !== GITHUB_HOST) {
    invalidRemote('host must be github.com');
  }
  if (url.search || url.hash) invalidRemote('query and fragment are unsupported');

  if (protocol === 'ssh:') {
    if (url.username !== 'git' || url.password || url.port) {
      invalidRemote('SSH remotes must use git@github.com without a port');
    }
  } else if (protocol === 'https:') {
    if (url.username || url.password || url.port) {
      invalidRemote('HTTPS remotes cannot include credentials or a port');
    }
  } else {
    invalidRemote('only SCP, SSH, and HTTPS remotes are supported');
  }

  if (!url.pathname.startsWith('/') || url.pathname.length < 2) {
    invalidRemote('repository path is missing');
  }
  return url.pathname.slice(1);
}

export function parseGitHubRemote(remoteUrl) {
  if (
    typeof remoteUrl !== 'string' ||
    remoteUrl.trim() !== remoteUrl ||
    !remoteUrl
  ) {
    invalidRemote('remote must be a non-empty URL');
  }
  if (/[\\\s\u0000-\u001f\u007f]/.test(remoteUrl)) {
    invalidRemote('backslashes and whitespace are unsupported');
  }

  const path = parseScpRemote(remoteUrl) ?? parseUrlRemote(remoteUrl);
  return parseRepositoryPath(path);
}

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
