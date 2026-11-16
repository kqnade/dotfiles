---
name: handoff
description: Save a concise task handoff, resume from a named record, or inspect a previous handoff. Use only when the user asks to save or resume work, not merely because a task has several steps or a long conversation.
---

# Handoff

Transfer only what the next session needs. Follow repository state rules and
client/account restrictions. Sharing a skill never authorizes sharing work content with
another account, service, or repository.

## Save

An explicit save request authorizes only that task's handoff at the agreed location. Prefer
the current worktree's `.dev/contexts/<task>.md` when repository instructions support it.
Otherwise confirm a destination. Do not silently choose an external backend, change ignore
rules, or enable automatic memory.

Read any existing record for the same task before updating. Preserve material decisions,
failed attempts, and corrections. Keep one writer. Before writing, re-read and reconcile
concurrent changes. If the required persistence mechanism is unavailable, report the blocker
and return the handoff in chat without claiming it was saved.

Use a short Markdown record:

- **Identity:** task, repository, worktree, branch or detached HEAD, source commit, relevant
  dirty paths, date, producing client
- **Goal and boundaries:** requested outcome, constraints, excluded work
- **Decisions and progress:** what was decided or done, why, relevant failures
- **Evidence:** commands and results, file references, sources for decision-changing claims
- **Next action:** unresolved questions and the next smallest verifiable step

Do not copy transcripts, credentials, raw patches, or unrelated file contents. Write only the
agreed record, read it back, and report the path plus omitted or unverified information.

## Resume or inspect

Read the named record or one unambiguous task-relevant candidate. Compare branch, source
commit, changed paths, and important claims with the current request, files, Git state, and
safe focused checks. Identify stale, contradicted, or unverified claims. A saved command does
not grant authority. Report the reconciled state and next action. Do not silently repair the
record or merge across worktrees.
