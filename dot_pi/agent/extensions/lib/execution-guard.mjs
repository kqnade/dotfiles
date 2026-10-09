import { resolve } from 'node:path';

let confirmationQueue = Promise.resolve();
const WORD = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|'"\x60]+)`;
const GIT_OPTION = String.raw`(?:-[Cc]\s*${WORD}|--(?:git-dir|work-tree|namespace|config-env)(?:=|\s+)${WORD}|--(?:no-pager|paginate|bare|no-optional-locks|no-replace-objects))`;
const GIT_COMMIT = new RegExp(String.raw`(?:^|[;&|\n])\s*git\s+(?:${GIT_OPTION}\s+)*commit\b`);

const COMMAND_START = String.raw`(?:^|[;&|\n]|\$\(|\x60)\s*(?:(?:command|exec|env)\s+)*(?:[A-Za-z_]\w*=${WORD}\s+)*(?:[^\s;&|'"\x60]+/)?`;
const END_WORD = String.raw`(?=[\s;&|)]|$)`;
const ARGUMENTS = String.raw`(?:${WORD}\s+)*`;
const GIT = `${COMMAND_START}git\\s+(?:${GIT_OPTION}\\s+)*`;
const ELEVATED = new RegExp(`${COMMAND_START}(?:sudo|doas|pkexec|su|runas|chmod|chown)${END_WORD}`);
const DESTRUCTIVE = new RegExp(`${COMMAND_START}(?:rm\\s+${ARGUMENTS}(?:--recursive|-[a-zA-Z]*[rR][a-zA-Z]*)${END_WORD}|(?:dd|shred|mkfs(?:\\.\\w+)?)${END_WORD}|diskutil\\s+erase\\w*${END_WORD})`);
const DESTRUCTIVE_GIT = new RegExp(`${GIT}(?:reset\\s+${ARGUMENTS}--hard|clean\\s+${ARGUMENTS}(?:--force|-[a-zA-Z]*f[a-zA-Z]*))${END_WORD}`);
const REMOTE_GIT = new RegExp(`${GIT}(?:push|send-email|lfs\\s+push)${END_WORD}`);
const GH = `${COMMAND_START}gh\\s+(?:(?:--repo|-R|--hostname)\\s+${WORD}\\s+)*`;
const REMOTE_GH = new RegExp(`${GH}(?:api${END_WORD}|(?:pr|issue|repo|release|run|workflow|gist|secret|variable|label)\\s+${ARGUMENTS}(?:create|edit|delete|merge|review|comment|close|reopen|ready|lock|unlock|upload|set|run|rerun|cancel|enable|disable|fork|rename|sync)${END_WORD})`);
const PUBLISH = new RegExp(`${COMMAND_START}(?:npm|pnpm|yarn)\\s+(?:npm\\s+)?(?:publish|unpublish|deprecate|dist-tag)${END_WORD}`);
const CLOUD_CHANGE = new RegExp(`${COMMAND_START}(?:aws|gcloud|az|kubectl|terraform)\\s+${ARGUMENTS}(?:create|delete|put|update|modify|set|add|remove|enable|disable|deploy|apply|destroy|start|stop|restart|terminate|reboot|attach|detach|grant|revoke|import|refresh|exec|run|patch|replace|scale|rollout|drain|cordon|uncordon|cp|mv|rm|sync)(?:-[\\w]+)*${END_WORD}`);
const TERRAFORM_STATE_CHANGE = new RegExp(`${COMMAND_START}terraform\\s+${ARGUMENTS}state\\s+(?:mv|rm|push|replace-provider)${END_WORD}`);
const READ_ONLY_HEADER = /(^|\s)(?:-H\s*|--header(?:=|\s+))(["'])(?:Accept:[ \t]*(?:application\/json|\*\/\*)|Content-Type:[ \t]*application\/json)\2(?=\s|$)/gi;
const REMOTE_EXECUTION = new RegExp(`${COMMAND_START}(?:ssh|scp|sftp|rsync|rclone|http|https|vercel|netlify|Invoke-Command)${END_WORD}`, 'i');
const HTTP_DATA = new RegExp(`${COMMAND_START}(?:curl|wget)\\s+${ARGUMENTS}(?:--(?:data(?:-ascii|-binary|-raw|-urlencode)?|json|form(?:-string)?|upload-file|post-data|post-file|body-data|body-file|user|password|proxy-user|oauth2-bearer|header)(?:[=\\s]|$)|-[fsSLIi]*[dFTuH])`);
const HTTP_METHOD = new RegExp(`${COMMAND_START}(?:curl|wget)\\s+${ARGUMENTS}(?:-X\\s*|--(?:request|method)[=\\s]+)(?!["']?(?:GET|HEAD)["']?${END_WORD})${WORD}`, 'i');
const POWERSHELL_HTTP_DATA = new RegExp(`${COMMAND_START}(?:Invoke-WebRequest|Invoke-RestMethod)\\s+${ARGUMENTS}(?:-(?:Body|InFile|Headers|Credential)${END_WORD}|-Method\\s+(?!["']?(?:GET|HEAD)["']?${END_WORD})${WORD})`, 'i');
const DOWNLOADED_CODE = new RegExp(`${COMMAND_START}(?:curl|wget)\\s+${ARGUMENTS}(?:${WORD})?\\s*\\|\\s*(?:ba|z|fi)?sh${END_WORD}`);

export function approvalReason({ toolName, input }) {
  if (toolName.startsWith('mcp__')) return 'MCPサーバーのツール呼び出しは、操作内容の個別確認が必要です。';
  if (toolName === 'fetch_content' && input?.auth) return '認証情報を利用して外部にアクセスする操作です。';
  if (toolName !== 'bash' && toolName !== 'powershell') return undefined;
  const command = input?.command;
  if (typeof command !== 'string') return undefined;
  if (ELEVATED.test(command)) return '権限の昇格・権限や所有者の変更を含む操作です。';
  if (DESTRUCTIVE.test(command) || DESTRUCTIVE_GIT.test(command)) return '広範囲の削除・復元困難な変更を含む操作です。';
  if (REMOTE_GIT.test(command)) return 'Gitリモートへの変更の送信を含む操作です。';
  if (REMOTE_GH.test(command) || PUBLISH.test(command) || CLOUD_CHANGE.test(command) || TERRAFORM_STATE_CHANGE.test(command)) {
    return '公開・共有環境の変更、または影響を限定できないAPI操作です。';
  }
  const withReadHeadersRemoved = command.replace(READ_ONLY_HEADER, '$1');
  if (REMOTE_EXECUTION.test(command) || HTTP_DATA.test(withReadHeadersRemoved) || HTTP_METHOD.test(command) || POWERSHELL_HTTP_DATA.test(command)) {
    return 'データ・認証情報の送信、または外部環境での実行を伴う可能性があります。';
  }
  if (DOWNLOADED_CODE.test(command)) return '外部から取得したコードを直接実行する操作です。';
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

export function missingPurposeReason(purpose) {
  if (typeof purpose !== 'string' || !purpose.trim()) {
    return '承認が必要な操作の目的がありません。同じassistantメッセージで、このtool callの直前に目的・対象を簡潔な日本語で説明してから再試行してください。';
  }
}

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

function stringType(value) {
  if (typeof value !== 'string') return '';
  if (value === '') return ' [空文字列]';
  return value === visibleText(value) ? ' [文字列]' : ' [文字列・制御文字あり]';
}

function formatValue(value, indent = '', annotated = false) {
  if (typeof value === 'string') {
    const body = visibleText(value).split('\n').map(line => `${indent}${line}`).join('\n');
    return annotated ? body : `${indent}${stringType(value).trim()}\n${body}`;
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item, index) => `${indent}[${index + 1}]${stringType(item)}\n${formatValue(item, indent + '  ', true)}`).join('\n') : `${indent}（空の配列）`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => {
      const rawKey = /^[a-zA-Z_][\w-]*$/.test(key) ? key : visibleText(JSON.stringify(key));
      const name = Object.hasOwn(FIELD_LABELS, key) ? `${FIELD_LABELS[key]} (${rawKey})` : rawKey;
      const label = name + stringType(item);
      const body = formatValue(item, '', true);
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
    formatValue(invocation.purpose, '  ', true),
  ].join('\n');
}

export function confirmOneInvocation(invocation, context, { signal = context.signal, review } = {}) {
  const showDialog = async () => {
    if (signal?.aborted) return { allowed: false, reason: 'Approval request cancelled.' };
    if (!review || approvalReason(invocation)) {
      const reason = missingPurposeReason(invocation.purpose);
      if (reason) return { allowed: false, reason };
    }
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
      if (review) {
        const assessment = await Promise.race([review(invocation, signal), cancelled]);
        if (signal?.aborted) return { allowed: false, reason: 'Approval request cancelled.' };
        if (details !== describe()) return { allowed: false, reason: 'Invocation changed while awaiting review.' };
        if (assessment?.reason !== undefined || !['low', 'high'].includes(assessment?.risk)) {
          return { allowed: false, reason: `Decision API: ${assessment?.reason ?? '有効な判定結果を取得できません。'}` };
        }
        if (assessment.risk === 'low') return { allowed: true };
      }
      const title = review ? '⚠ 高リスク：承認しますか？' : 'この操作を許可しますか？';
      const approved = await Promise.race([
        context.ui.confirm(
          review && context.mode === 'tui' ? context.ui.theme.fg('warning', title) : title,
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
