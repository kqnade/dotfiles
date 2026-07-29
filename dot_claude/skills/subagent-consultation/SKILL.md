---
name: subagent-consultation
description: >-
  Ask an isolated company-approved subagent for an independent second opinion, then verify
  and reconcile its findings. Use when the user explicitly requests a subagent consultation,
  not as a fallback for adversarial-review.
argument-hint: "[question and desired depth]"
disallowed-tools:
  - Write
  - Edit
---

# Subagent consultation

Send an isolated subagent a self-contained question. Include:

- the goal and relevant repository scope;
- verified facts and links to relevant `.dev/` records;
- the specific claim, design, or diff to challenge;
- the current hypothesis when useful;
- a request to seek counterexamples and overlooked alternatives.

Use a read-only subagent. It may inspect the supplied evidence and related repository files,
but must not edit files, run side-effecting commands, commit, post, invoke other agents, or
perform outward actions. If the available environment cannot enforce that boundary, stop
and report that the consultation was not performed.

Use Claude subagents from the same company-managed environment as the main session. GitHub
Copilot is company-managed but is not a Claude subagent, so do not use it as an automatic
fallback. OpenCode, Codex, and Kimi use personal accounts and must not receive repository
content.

Use one pass by default. Use a second pass only when the first result exposes a material
unresolved disagreement; include the full context again because the second agent may not
share the first agent's state.

Do not accept findings on authority. For every material claim:

1. inspect the cited code, command output, or source;
2. separate confirmed facts from inference;
3. explain agreements and disagreements;
4. report any missing access that weakened the review.

Return a concise synthesis with the subagent's view, the main agent's verified assessment,
and the remaining decision.
