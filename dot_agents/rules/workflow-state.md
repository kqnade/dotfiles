# Repository workflow state

- When the current Git worktree contains `.dev/`, treat it as the repository-owned source of truth
  for AI workflow state and follow the repository's instructions for its layout and lifecycle.
- Before planning or changing repository files, inspect only a task-relevant active item in
  `.dev/todo/`, when one exists, then follow only its task-relevant links. Do not load unrelated
  context or memory entries.
- Check repository identity, provenance, and freshness before relying on a decision-changing
  claim. Current user instructions, files, Git state, tests, runtime behavior, and primary sources
  take precedence over conflicting or stale records.
- Keep linked worktree state in that worktree. Never redirect it into another worktree's `.dev/`
  or silently merge records across worktrees.
- Do not create or write `.dev/`, change its ignore policy, or select an external state backend
  unless repository instructions or an explicitly invoked workflow authorize that state change.
