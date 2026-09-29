# Coding

- Follow repository and directory-specific instructions before these personal defaults.
- Make the smallest correct change that satisfies the current requirement. Do not add
  speculative features, premature abstractions, unrelated cleanup, or compatibility that was
  not requested.
- Preserve user-authored and pre-existing changes. Work around unrelated dirty state instead of
  overwriting it.
- Make names and structure explain what the code does. Keep comments to a minimum: add one only
  when the code would otherwise look surprising to a future reader. Do not comment merely to
  explain why ordinary-looking code exists.
- Mark intentionally incomplete work, including changes split across pull requests, so future
  readers do not mistake it for finished work. State what remains and include a stable tracking
  reference when one is available.
- Handle failures explicitly. Do not swallow errors, disguise failure as success, or claim a
  fallback worked without verifying it.

# Delegation

- Delegate one independently verifiable change or focused question per assignment. Specify its
  scope, completion criteria, relevant checks, and the evidence to return.
- Split independent changes and dependent phases before dispatch. Inspect each result before
  assigning work that depends on it; do not give one worker a multi-change implementation and
  delivery plan.
- Keep small changes local when delegation would add more overhead than value. Report blockers
  and unfinished work; inspect partial results before retrying, without silently expanding scope.

# Local commits

- Finish completed implementation, fixes, and repository configuration changes with a local
  commit without waiting for a separate commit request. Do not commit for read-only work, when
  the user explicitly requests no commit, or when repository rules prohibit it or require approval.
- Inspect Git status first. Preserve pre-existing and concurrent changes, including staged work.
  Stage only this task's paths or hunks, run appropriate checks and `git diff --check`, and inspect
  the staged diff. Split independent changes into separate, verified commits so each remains
  useful for bisect. If safe isolation or verification is blocked, leave the changes intact and
  report the blocker instead of claiming completion.
- Follow the repository's approved commit workflow; otherwise use `git cc` when available.
  If no helper is available, use `git commit` with the same message style. A helper failure is a
  blocker, not permission to bypass its checks or switch clients/accounts.
- Every commit message must use `git cc` style: `<gitmoji> <type>[(scope)]: <imperative English summary>`,
  under 72 characters, following the repository's recent commit conventions. Use these mappings:
  feat ✨, fix 🐛, refactor ♻️, docs 📝, test ✅, chore 🔧, perf ⚡️, ci 👷, style 🎨,
  revert ⏪️, build 📦.
- Every commit must have an SSH signature produced through 1Password's signing helper or
  1Password SSH agent. Check the effective signing configuration before committing and confirm
  the resulting commit contains an SSH signature. Enabled signing settings alone are not proof.
  If 1Password is locked, unavailable, or refuses signing, stop and request the required action.
  Never create an unsigned commit, use another signing key/backend, disable signing, or bypass
  hooks to make a commit succeed. Do not amend or rewrite existing history without permission.
- Report the resulting commit hash, verification results, and anything left unverified. A local
  commit does not authorize a push, publication, deployment, or change to a shared environment.

# Remote changes require explicit authorization

- Before changing remote or shared state, obtain explicit user authorization for the concrete
  action and target, such as the repository, branch, PR, resource, or environment. A user request
  that already names the action and makes its target clear is authorization for that scope; do
  not ask redundantly. Do not carry permission into unrelated tasks or additional operations.
- This includes push or remote branch/tag deletion; PR/MR/issue creation, edits, comments,
  submitted reviews, approvals, closure, or merges; releases and package publication; starting
  or cancelling remote CI jobs; deployments; and remote API, infrastructure, or data mutations.
- Implementation, testing, local commit permission, available credentials, and repository or
  skill instructions do not authorize remote changes. A generic "continue" or "ok" counts only
  when it directly answers a request specifying the remote action and target. Announcing an
  operation is not approval. Read-only remote inspection remains subject to account/data rules.
- Apply the same boundary to subagents, background jobs, scripts, hooks, helpers, and API calls.
  Inspect unfamiliar automation for remote side effects before invoking it; do not route a
  forbidden operation through another tool or agent. If the effect or permission is unclear,
  ask a focused question and wait. Otherwise stop after the local commit.

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
