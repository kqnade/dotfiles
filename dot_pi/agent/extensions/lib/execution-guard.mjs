import { resolve } from 'node:path';

const EXTERNAL_TOOLS = new Set(['web_search', 'source_check', 'fetch_content']);
let confirmationQueue = Promise.resolve();
const WORD = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|'"\x60]+)`;
const GIT_OPTION = String.raw`(?:-[Cc]\s*${WORD}|--(?:git-dir|work-tree|namespace|config-env)(?:=|\s+)${WORD}|--(?:no-pager|paginate|bare|no-optional-locks|no-replace-objects))`;
const GIT_COMMIT = new RegExp(String.raw`(?:^|[;&|\n])\s*git\s+(?:${GIT_OPTION}\s+)*commit\b`);

const COMMAND_START = String.raw`(?:^|[;&|\n]|\$\(|\x60)\s*(?:(?:command|exec|sudo|env)\s+)*(?:[A-Za-z_]\w*=${WORD}\s+)*(?:[^\s;&|'"\x60]+/)?`;
const REMOTE_GIT = new RegExp(`${COMMAND_START}git\\s+(?:${GIT_OPTION}\\s+)*(?:push|fetch|pull|clone|ls-remote|remote\\s+update)\\b`);
const NETWORK_COMMAND = new RegExp(`${COMMAND_START}(?:curl|wget|ssh|scp|sftp|rsync|rclone|http|https|Invoke-WebRequest|Invoke-RestMethod|aws|gcloud|az|kubectl|terraform|vercel|netlify)(?=[\\s;&|)]|$)`, 'i');
const REMOTE_MANAGER = new RegExp(`${COMMAND_START}(?:gh\\s+(?:(?:--repo|-R)\\s+${WORD}\\s+)*(?:api|pr|issue|repo|release|run|workflow|gist|secret|variable)|(?:npm|pnpm|yarn)\\s+(?:install|i|add|update|up|publish|unpublish|dlx)|npx|(?:uv|pip|pip3)\\s+(?:install|sync)|mise\\s+(?:install|upgrade|bootstrap))\\b`);

export function approvalReason({ toolName, input }) {
  if (EXTERNAL_TOOLS.has(toolName)) return '外部サービスへの問い合わせ・データ送信を行うツールです。';
  if (toolName !== 'bash' && toolName !== 'powershell') return undefined;
  const command = input?.command;
  if (typeof command !== 'string') return undefined;
  if (REMOTE_GIT.test(command)) return 'Gitリモートへのアクセス・変更を含むコマンドです。';
  if (NETWORK_COMMAND.test(command) || REMOTE_MANAGER.test(command)) {
    return '外部通信・共有環境の操作を伴う可能性があるコマンドです。';
  }
}

export function isDirectGitCommit({ toolName, input }) {
  return toolName === 'bash'
    && typeof input?.command === 'string'
    && GIT_COMMIT.test(input.command);
}

export function isForbiddenCommitBypass({ toolName, input }) {
  if (toolName !== 'bash' || typeof input?.command !== 'string') return false;
  const command = input.command;
  return (isDirectGitCommit({ toolName, input }) && (
    /(?:--no-gpg-sign|--no-verify|\s-n)(?:\s|$)/.test(command)
    || /(?:commit\.gpgsign\s*=\s*false|core\.hooksPath\s*=\s*\/dev\/null)/i.test(command)
  )) || /\bGIT_CONFIG_(?:COUNT|KEY_[0-9]+|VALUE_[0-9]+)=/.test(command);
}

export const MAX_PURPOSE_LENGTH = 1024;

export function toolCallPurpose(branch, toolCallId) {
  if (!toolCallId) return undefined;
  for (const entry of branch.slice().reverse()) {
    const message = entry.message;
    if (entry.type !== 'message' || message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
    const index = message.content.findIndex(block => block.type === 'toolCall' && block.id === toolCallId);
    if (index < 0) continue;
    const preceding = message.content.slice(0, index);
    const previousCall = preceding.findLastIndex(block => block.type === 'toolCall');
    const text = preceding.slice(previousCall + 1).filter(block => block.type === 'text')
      .map(block => block.text).join('\n').trim();
    if (!text) return undefined;
    const characters = Array.from(text);
    return characters.slice(0, 500).join('') + (characters.length > 500 ? '…（以下省略）' : '');
  }
}

const ACTIONS = {
  bash: 'シェルコマンドを実行', powershell: 'PowerShellコマンドを実行',
  web_search: '外部サービスで検索', source_check: '外部情報で主張を確認', fetch_content: '指定先から内容を取得',
};
const FIELD_LABELS = { command: 'コマンド', path: '対象ファイル', content: '内容', edits: '変更箇所', oldText: '変更前', newText: '変更後', query: '検索語', queries: '検索語', url: '取得先', urls: '取得先' };

function visibleText(value) {
  return String(value).replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function oneLine(value) {
  return visibleText(value).replace(/\n/g, '\\n');
}

function formatValue(value, indent = '') {
  if (typeof value === 'string') {
    const text = value === '' ? '（空文字列）' : visibleText(value);
    return text.split('\n').map(line => `${indent}${line}`).join('\n');
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item, index) => `${indent}[${index + 1}]\n${formatValue(item, indent + '  ')}`).join('\n') : `${indent}（空の配列）`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => {
      const label = Object.hasOwn(FIELD_LABELS, key) ? FIELD_LABELS[key] : oneLine(key);
      const body = formatValue(item);
      return body.includes('\n') || key === 'command'
        ? `${indent}${label}:\n${body.split('\n').map(line => indent + '  ' + line).join('\n')}`
        : `${indent}${label}: ${body}`;
    }).join('\n') : `${indent}（空のオブジェクト）`;
  }
  return `${indent}${String(value)}`;
}

function formatApproval(invocation, cwd) {
  const action = Object.hasOwn(ACTIONS, invocation.toolName) ? ACTIONS[invocation.toolName] : 'ツールを実行';
  return [
    `操作: ${action} (${oneLine(invocation.toolName)})`,
    `作業場所: ${oneLine(resolve(cwd))}`,
    ...(invocation.childSessionId ? [`子session: ${oneLine(invocation.childSessionId)}`] : []),
    ...(invocation.toolCallId ? [`呼出ID: ${oneLine(invocation.toolCallId)}`] : []),
    '', formatValue(invocation.input), '',
    `確認理由: ${approvalReason(invocation) ?? 'この操作の個別確認が要求されています。'}`,
    '目的（agentの説明・参考）:',
    formatValue(invocation.purpose || '目的の説明は添えられていません。', '  '),
    '', '承認の対象はこの1回のみです。',
  ].join('\n');
}

export function confirmOneInvocation(invocation, context, { signal = context.signal } = {}) {
  const showDialog = async () => {
    if (signal?.aborted) return { allowed: false, reason: 'Approval request cancelled.' };
    if (!context.hasUI) {
      return { allowed: false, reason: 'No interactive approval UI is available.' };
    }
    const describe = () => JSON.stringify({
      cwd: resolve(context.cwd), childSessionId: invocation.childSessionId,
      toolCallId: invocation.toolCallId, tool: invocation.toolName, input: invocation.input, purpose: invocation.purpose,
    });
    const details = describe();
    let cancel;
    const cancelled = new Promise(resolve => {
      cancel = () => resolve(false);
      signal?.addEventListener('abort', cancel, { once: true });
    });
    try {
      const approved = await Promise.race([
        context.ui.confirm(
          'この操作を許可しますか？',
          formatApproval(invocation, context.cwd),
          { signal },
        ),
        cancelled,
      ]);
      if (details !== describe()) return { allowed: false, reason: 'Invocation changed while awaiting approval.' };
      return approved === true && !signal?.aborted
        ? { allowed: true }
        : { allowed: false, reason: 'The user did not approve this invocation.' };
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  };

  const result = confirmationQueue.then(showDialog, showDialog);
  confirmationQueue = result.then(() => undefined, () => undefined);
  return result;
}
