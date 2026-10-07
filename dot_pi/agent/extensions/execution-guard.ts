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
  const reviewerMode = process.env.PI_APPROVAL_REVIEWER ?? 'decision';
  const reviewer = reviewerMode === 'decision'
    ? createDecisionReviewer({ observe: event => pi.events.emit(DECISION_EVENT, event) })
    : undefined;
  let lifetime = new AbortController();
  let server: Awaited<ReturnType<typeof createApprovalServer>> | undefined;
  let endpoint;
  let published: string | undefined;
  let started = false;
  let startupError: string | undefined;

  function reviewFor(context: ExtensionContext) {
    const owned = reviewer;
    return owned && ((invocation, signal) => owned({ ...invocation, cwd: invocation.cwd ?? context.cwd }, {
      branch: context.sessionManager?.getBranch() ?? [],
      contextFiles: context.getSystemPromptOptions?.().contextFiles, signal,
    }));
  }

  async function shutdown() {
    started = false;
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
      if (!['decision', 'user'].includes(reviewerMode)) throw new Error('PI_APPROVAL_REVIEWER must be decision or user.');
      if (context.hasUI) {
        if (parseChannel(process.env[APPROVAL_ENV])?.ownerPid === process.pid) {
          throw new Error('An approval UI already owns this process; use a separate Pi process.');
        }
        server = await createApprovalServer((invocation, signal) => {
          const reason = commitBlock(invocation);
          if (reason) return { allowed: false, reason };
          return confirmOneInvocation(invocation, {
            hasUI: context.hasUI, ui: context.ui, cwd: invocation.cwd,
          }, { signal, review: reviewFor(context) });
        });
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
    const guideline = '承認が必要な高リスク操作では、各tool callの直前に同じassistantメッセージの公開テキストで、操作の目的・対象を簡潔な日本語で必ず説明してください。説明がない呼び出しは確認画面を出さずに拒否されます。複数のtool callにもそれぞれ説明を添えてください。説明は承認や安全性の保証にはなりません。';
    if (!event.systemPromptOptions.promptGuidelines.includes(guideline)) {
      event.systemPromptOptions.promptGuidelines.push(guideline);
    }
  });

  pi.on('tool_call', async (event, context) => {
    const reason = commitBlock(event);
    if (reason) return { block: true, reason };
    if (reviewerMode === 'user' || !['bash', 'powershell'].includes(event.toolName)) {
      if (!approvalReason(event)) return;
    }
    if (!started) return { block: true, reason: startupError ?? 'Approval session is not initialized.' };

    const signal = context.signal
      ? AbortSignal.any([lifetime.signal, context.signal])
      : lifetime.signal;
    try {
      const purpose = toolCallPurpose(context.sessionManager.getBranch(), event.toolCallId);
      if (approvalReason(event)) {
        const purposeReason = missingPurposeReason(purpose);
        if (purposeReason) return { block: true, reason: purposeReason };
      }
      const decision = context.hasUI
        ? await confirmOneInvocation({ ...event, purpose }, context, { signal, review: reviewFor(context) })
        : await requestApproval(endpoint, {
          toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, purpose,
          cwd: context.cwd, childSessionId: context.sessionManager.getSessionId(),
        }, { signal });
      if (!decision.allowed) return { block: true, reason: decision.reason };
    } catch (error) {
      return { block: true, reason: `Approval failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  });
}
