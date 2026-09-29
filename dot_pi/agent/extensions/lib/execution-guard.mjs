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

export function confirmOneInvocation(invocation, context, { signal = context.signal } = {}) {
  const showDialog = async () => {
    if (signal?.aborted) return { allowed: false, reason: 'Approval request cancelled.' };
    if (!context.hasUI) {
      return { allowed: false, reason: 'No interactive approval UI is available.' };
    }
    const describe = () => JSON.stringify({
      cwd: resolve(context.cwd), childSessionId: invocation.childSessionId,
      toolCallId: invocation.toolCallId, tool: invocation.toolName, input: invocation.input,
    }, null, 2);
    const details = describe();
    let cancel;
    const cancelled = new Promise(resolve => {
      cancel = () => resolve(false);
      signal?.addEventListener('abort', cancel, { once: true });
    });
    try {
      const approved = await Promise.race([
        context.ui.confirm(
          'Approve one tool call?',
          `This approves this exact invocation once. It does not grant future permission.\n${details}`,
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
