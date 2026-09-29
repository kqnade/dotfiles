import { resolve } from 'node:path';

const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
let confirmationQueue = Promise.resolve();
const WORD = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|'"\x60]+)`;
const GIT_OPTION = String.raw`(?:-[Cc]\s*${WORD}|--(?:git-dir|work-tree|namespace|config-env)(?:=|\s+)${WORD}|--(?:no-pager|paginate|bare|no-optional-locks|no-replace-objects))`;
const GIT_COMMIT = new RegExp(String.raw`(?:^|[;&|\n])\s*git\s+(?:${GIT_OPTION}\s+)*commit\b`);

export function isReadOnlyTool(name) {
  return READ_ONLY_TOOLS.has(name);
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

export function confirmOneInvocation(invocation, context) {
  const showDialog = async () => {
    if (!context.hasUI) {
      return { allowed: false, reason: 'No interactive approval UI is available.' };
    }
    const cwd = resolve(context.cwd);
    const details = JSON.stringify(invocation.input, null, 2);
    const approved = await context.ui.confirm(
      `Approve one ${invocation.toolName} call?`,
      `This approves this exact invocation once. It does not grant future permission.\ncwd: ${cwd}\ntool: ${invocation.toolName}\ninput:\n${details}`,
    );
    return approved === true
      ? { allowed: true }
      : { allowed: false, reason: 'The user did not approve this invocation.' };
  };

  const result = confirmationQueue.then(showDialog, showDialog);
  confirmationQueue = result.then(() => undefined, () => undefined);
  return result;
}
