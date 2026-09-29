import { resolve } from 'node:path';

const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
let confirmationQueue = Promise.resolve();

export function isReadOnlyTool(name) {
  return READ_ONLY_TOOLS.has(name);
}

export function isDirectGitCommit({ toolName, input }) {
  return toolName === 'bash'
    && typeof input?.command === 'string'
    && /(?:^|[;&|]\s*)git\s+commit\b/.test(input.command);
}

export function isForbiddenCommitBypass({ toolName, input }) {
  if (toolName !== 'bash' || typeof input?.command !== 'string') return false;
  const command = input.command;
  return /\bgit\s+commit\b[^\n]*(?:--no-gpg-sign|--no-verify)(?:\s|$)/.test(command)
    || /\bgit\s+-c\s+(?:commit\.gpgsign\s*=\s*false|core\.hooksPath\s*=\s*\/dev\/null)\s+commit\b/.test(command)
    || /\bGIT_CONFIG_(?:COUNT|KEY_[0-9]+|VALUE_[0-9]+)=/.test(command);
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
    return approved
      ? { allowed: true }
      : { allowed: false, reason: 'The user did not approve this invocation.' };
  };

  const result = confirmationQueue.then(showDialog, showDialog);
  confirmationQueue = result.then(() => undefined, () => undefined);
  return result;
}
