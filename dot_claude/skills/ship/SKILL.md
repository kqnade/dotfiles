---
name: ship
description: >-
  Push an already verified series of traceable commits and optionally create a pull
  request using only verbatim user-authored body text. Never generates a PR body.
argument-hint: "[optional PR title]"
disable-model-invocation: true
allowed-tools:
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(gh pr view *)
---

# Ship

Publish work that has already been completed through the `develop` workflow.

## 1. Verify readiness

1. Inspect `git status`, branch commits, and the relevant `.dev/todo/`.
2. Confirm each completed TODO maps to a cohesive passing commit.
3. Run `git status --short --untracked-files=all`. If any related staged, unstaged, or
   untracked work remains outside the intended commits, stop. Do not ignore new files or
   batch unrelated leftovers into a final commit.
4. Run or confirm the repository's required pre-push checks.

## 2. Push

Show the branch and commits that will be pushed. Ask for confirmation, then push without
force. Use `-u` when the branch has no upstream.

## 3. Pull request

If a pull request already exists, report its URL and do not edit its body.

Never draft, complete, rewrite, or suggest copy-ready pull request body text. Never use
`gh pr create --fill`. A title may be proposed, but body text must come from the user.

Create a pull request only when the user supplies either:

- exact body text to submit verbatim; or
- a path to a body file the user authored.

Show the exact title and unchanged body source, ask for confirmation, then create the pull
request. If no user-authored body is available, stop after push and ask the user to write
the body; do not fill the gap.

Use `/conversation-context-export publish` separately when the user explicitly requests a
Japanese, collapsible AI-context comment after the pull request exists.

Report user-facing pull request information in Japanese while preserving identifiers,
commands, and user-authored text exactly.
