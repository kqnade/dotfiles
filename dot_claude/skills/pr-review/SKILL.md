---
name: pr-review
description: >-
  Review a pull request, staged diff, or file with only the specialist agents justified
  by the change. Produces a concise evidence-backed Japanese report.
argument-hint: "[PR number | staged | file path]"
disallowed-tools:
  - Write
  - Edit
---

# PR Review

Use this for a focused code review. Use `sanity-review` when the decision process,
human-authored PR body, and `.dev` records also require deep review. Route dependency-only
updates to `library-update-review`.

## 1. Determine scope

- PR number or URL: fetch metadata, full diff, checks, and unresolved review comments.
- `staged`: review `git diff --cached` and every related untracked path reported by
  `git status --short --untracked-files=all`.
- File path: review the current file and its relevant callers or tests.
- No argument: detect the current branch's PR. Without a PR, inspect `git status --short
  --untracked-files=all`, then review staged, unstaged, and untracked changes. Read new
  files directly; they do not appear in ordinary `git diff`.

Stop when there is no reviewable change.

## 2. Select reviewers from evidence

Read the diff before selecting agents:

- `code-reviewer`: correctness for code changes.
- `silent-failure-hunter`: error handling, fallbacks, retries, or async flows.
- `pr-test-analyzer`: behavior changes or test changes.
- `security-reviewer`: auth, untrusted input, queries, paths, tokens, or crypto.
- `performance-reviewer`: known hot paths, queries, unbounded work, or resource ownership.
- `doc-reviewer`: documentation or public API changes.

Dispatch independent reviewers in parallel when more than one applies. Do not run a
specialist merely because it exists. Ask for evidence as `file:line` and a concrete failure
mode; confidence scores alone are not evidence.

Reviewer agents are read-only. The main agent must give them the changed paths, relevant
hunks, and review question. Reviewers may inspect related source and tests but must not edit
files, run side-effecting commands, commit, post, or delegate. The main agent owns live
command execution and reproduction of findings.

Use `adversarial-review` when the reviewers disagree on a decision-changing claim or when
the change has consequential design, security, or correctness tradeoffs.

## 3. Verify and synthesize

The main agent must inspect every proposed blocker. Deduplicate overlap, withdraw findings
that cannot be reproduced from the diff or repository, and preserve material unresolved
disagreement.

Write the report in Japanese unless the repository explicitly requires another language:

```markdown
## PRレビュー

- 対象:
- CI:
- 使用したレビュワー:

### マージを妨げる問題

### その他の指摘

### 未解決の対立点

### 結論
```

Keep code identifiers, commands, and quotations in their original form. If there are no
findings, state which evidence and reviewer scopes were checked rather than claiming the
change is universally safe.

Output the report in the conversation. Do not post it or edit the PR unless the user explicitly authorizes that outward action.
Never generate or rewrite the pull request body. Point out missing or contradictory
information without supplying replacement prose.
