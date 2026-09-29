import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { confirmOneInvocation, isDirectGitCommit, isForbiddenCommitBypass, isReadOnlyTool } from './lib/execution-guard.mjs';

export default function (pi: ExtensionAPI) {
  pi.on('tool_call', async (event, context) => {
    if (isReadOnlyTool(event.toolName)) return;
    if (isForbiddenCommitBypass(event)) {
      return {
        block: true,
        reason: 'This git commit command explicitly bypasses signing or hooks and is not allowed.',
      };
    }
    if (isDirectGitCommit(event)) {
      return { block: true, reason: 'Use the repository git cc helper for commits.' };
    }

    const decision = await confirmOneInvocation(event, context);
    if (!decision.allowed) return { block: true, reason: decision.reason };
  });
}
