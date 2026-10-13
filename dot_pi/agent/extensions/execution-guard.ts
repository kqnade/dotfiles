import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from '@earendil-works/pi-coding-agent';
import { APPROVAL_ENV, createApprovalServer, requestApproval } from './lib/approval-channel.mjs';
import { createDecisionReviewer, DECISION_EVENT } from './lib/decision-review.mjs';
import { approvalReason, confirmOneInvocation, isDirectGitCommit, isForbiddenCommitBypass, missingPurposeReason, toolCallPurpose } from './lib/execution-guard.mjs';

function commitBlock(invocation: Pick<ToolCallEvent, 'toolName' | 'input'>) {
  if (isForbiddenCommitBypass(invocation)) return 'This git commit command explicitly bypasses signing or hooks and is not allowed.';
  if (isDirectGitCommit(invocation)) return 'Use the repository git cc helper for commits.';
}

function parseChannel(value: string | undefined) {
  if (!value) return undefined;
  try { return JSON.parse(value); }
  catch { throw new Error('Invalid parent approval channel metadata.'); }
}

export default function (pi: ExtensionAPI) {
  if (process.env.PI_EXECUTION_GUARD === '0') return;

  const inherited = process.env[APPROVAL_ENV];
  const modes = ['decision', 'allowall', 'user'];
  let reviewerMode = process.env.PI_APPROVAL_REVIEWER ?? 'decision';
  const reviewer = createDecisionReviewer({ observe: event => pi.events.emit(DECISION_EVENT, event) });
  let pendingApprovals = 0;
  let lifetime = new AbortController();
  let server: Awaited<ReturnType<typeof createApprovalServer>> | undefined;
  let endpoint;
  let published: string | undefined;
  let started = false;
  let startupError: string | undefined;
  let contextFiles: Array<{ path: string; content: string }> | undefined;

  function reviewFor(context: ExtensionContext, mode: string) {
    return mode === 'user' ? undefined : ((invocation, signal) => reviewer({ ...invocation, cwd: invocation.cwd ?? context.cwd }, {
      branch: context.sessionManager?.getBranch() ?? [],
      contextFiles, signal, mode,
    }));
  }

  async function decide(invocation, context: ExtensionContext, signal: AbortSignal) {
    const reason = commitBlock(invocation);
    if (reason) return { allowed: false, reason };
    const mode = reviewerMode;
    const risk = approvalReason(invocation);
    if (!risk && (mode === 'user' || !['bash', 'powershell'].includes(invocation.toolName))) return { allowed: true };
    pendingApprovals++;
    try {
      if (mode !== 'allowall' && risk) {
        if (invocation.parentToolCallId) {
          return { allowed: false, reason: 'この操作はcodemodeなどの入れ子呼び出しでは承認できません。目的・対象を説明し、ツールを直接呼び出してください。' };
        }
        const purposeReason = missingPurposeReason(invocation.purpose);
        if (purposeReason) return { allowed: false, reason: purposeReason };
      }
      const prepared = invocation.parentToolCallId ? { ...invocation, purpose: undefined } : invocation;
      if (!context.hasUI) return { allowed: false, reason: 'No valid parent approval channel.' };
      return await confirmOneInvocation(prepared, context, { signal, review: reviewFor(context, mode), reviewFirst: mode === 'allowall' });
    } finally { pendingApprovals--; }
  }

  pi.registerCommand('approval-mode', {
    description: 'Select execution approval mode: decision, allowall or user',
    getArgumentCompletions: prefix => [...modes, 'status'].filter(value => value.startsWith(prefix)).map(value => ({ value, label: value })),
    handler: async (args, context) => {
      if (!started) throw new Error(startupError ?? 'Approval session is not initialized.');
      if (!context.hasUI || endpoint) throw new Error('/approval-mode はUIを持つ親セッションで実行してください。');
      let selected = args.trim();
      if (selected === 'status') {
        context.ui.notify(`実行承認モード: ${reviewerMode}`, 'info');
        return;
      }
      const busy = () => !context.isIdle() || pendingApprovals > 0;
      const warnBusy = () => context.ui.notify('実行または承認判定が進行中です。完了後にモードを切り替えてください。', 'warning');
      if (busy()) { warnBusy(); return; }
      if (!selected) {
        const choice = await context.ui.select(`実行承認モード（現在: ${reviewerMode}）`, modes);
        if (choice === undefined) return;
        selected = choice;
      }
      if (!modes.includes(selected)) {
        context.ui.notify('decision、allowall、user のいずれかを指定してください。', 'error');
        return;
      }
      if (busy()) { warnBusy(); return; }
      reviewerMode = selected;
      process.env.PI_APPROVAL_REVIEWER = selected;
      context.ui.notify(`実行承認モード: ${selected}（このPiプロセス内で有効）`, 'info');
    },
  });

  async function shutdown() {
    started = false;
    contextFiles = undefined;
    lifetime.abort();
    if (published && process.env[APPROVAL_ENV] === published) delete process.env[APPROVAL_ENV];
    published = undefined;
    const owned = server;
    server = undefined;
    endpoint = undefined;
    await owned?.close();
  }

  pi.on('session_start', async (_event, context) => {
    await shutdown();
    lifetime = new AbortController();
    startupError = undefined;
    try {
      if (!modes.includes(reviewerMode)) throw new Error('PI_APPROVAL_REVIEWER must be decision, allowall or user.');
      if (context.hasUI) {
        if (parseChannel(process.env[APPROVAL_ENV])?.ownerPid === process.pid) {
          throw new Error('An approval UI already owns this process; use a separate Pi process.');
        }
        server = await createApprovalServer((invocation, signal) => decide(invocation,
          { ...context, cwd: invocation.cwd }, AbortSignal.any([lifetime.signal, signal])));
        published = JSON.stringify(server.endpoint);
        process.env[APPROVAL_ENV] = published;
      } else {
        endpoint = parseChannel(inherited);
      }
      started = true;
    } catch (error) {
      startupError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });

  pi.on('session_shutdown', shutdown);

  pi.on('before_agent_start', event => {
    contextFiles = event.systemPromptOptions.contextFiles;
    const guideline = '承認が必要な高リスク操作では、各tool callの直前に同じassistantメッセージの公開テキストで、操作の目的・対象を簡潔な日本語で必ず説明してください。説明がない呼び出しは確認画面を出さずに拒否されます。複数のtool callにもそれぞれ説明を添えてください。説明は承認や安全性の保証にはなりません。';
    if (!event.systemPromptOptions.promptGuidelines.includes(guideline)) {
      event.systemPromptOptions.promptGuidelines.push(guideline);
    }
  });

  pi.on('tool_call', async (event, context) => {
    const reason = commitBlock(event);
    if (reason) return { block: true, reason };
    if (!approvalReason(event) && (!['bash', 'powershell'].includes(event.toolName) || (reviewerMode === 'user' && !endpoint))) return;
    if (!started) return { block: true, reason: startupError ?? 'Approval session is not initialized.' };

    const signal = context.signal
      ? AbortSignal.any([lifetime.signal, context.signal])
      : lifetime.signal;
    try {
      const purpose = event.parentToolCallId ? undefined : toolCallPurpose(context.sessionManager.getBranch(), event.toolCallId);
      const invocation = { ...event, purpose, cwd: context.cwd };
      const decision = context.hasUI
        ? await decide(invocation, context, signal)
        : endpoint ? await requestApproval(endpoint, {
          toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, purpose,
          parentToolCallId: event.parentToolCallId,
          cwd: context.cwd, childSessionId: context.sessionManager.getSessionId(),
        }, { signal }) : await decide(invocation, context, signal);
      if (!decision.allowed) return { block: true, reason: decision.reason };
    } catch (error) {
      return { block: true, reason: `Approval failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  });
}
