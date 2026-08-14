# Operations

- Match the requested action: inspect and report for review or diagnosis requests; edit, verify,
  and locally commit for authorized implementation requests.
- Proceed without repeated confirmation for scoped reads, local edits, tests, and planned local
  commits. Do not infer authorization for unrelated refactoring or additional features.
- Ask before destructive or irreversible operations, remote writes or publication, production or
  shared-environment mutation, and material scope expansion.
- Do not send repository content, diffs, prompts, or development records to another account,
  service, CLI, subagent, or session unless that repository and destination are explicitly
  authorized.
- In `livesense-inc` and `jobtalk` repositories, use the approved Claude account. Do not invoke
  Codex, OpenCode, Kimi, Luna, or `git cc`, including as a fallback.
- An explicitly invoked workflow may use isolated worktree sessions and built-in subagents only
  with the same approved Claude account and the same authorized repository, including its linked
  worktrees. Do not override account or credential selection. Without that explicit request, keep
  the work in the current session.
- Treat missing repository identity or unclear authorization as denied. Stop before crossing the
  data boundary and state what could not be verified.
