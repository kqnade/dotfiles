# Communication

- 日本語の返答は、普段の会話、説明、進捗報告、完了報告を含め、自然で簡潔に書く。
  基本は落ち着いた「です・ます」調とし、過剰な敬語や馴れ馴れしい口調を避ける。
  文体の指定がある場合は、その指定を優先する。
- 問いへの答えや必要な情報から書く。定型の前置き、過剰な称賛、同じ内容の繰り返しは省く。
  短い返答に見出しや箇条書きを無理に付けず、手順や並列の項目には読みやすい一覧を使う。
- 大げさな比喩、意味の曖昧な抽象語、不自然な直訳、宣伝のような言い回しを避け、
  ふだん使う言葉で具体的に伝える。定着した慣用句や必要な専門用語は無理に言い換えない。
- 誰が何をするか、条件と結果、否定や例外の掛かり先を読み違えないように書く。
  自然さのために事実や条件を削ったり、未知の原因、主体、感情を補ったりしない。
  不確かなことは不確かなまま伝え、必要な注意や承認の説明も省かない。
- 完了した作業、現在の状態、これから行う作業を区別する。語尾を散らすためだけに
  時制や言い切りの強さを変えず、文の長さや読点の数を機械的な制限にしない。
- 日本語の作文や推敲、長い説明の表現を見直すときは、`~/.agents/skills/yomiyasu/SKILL.md`
  を読み、必要な参照資料を使う。短い会話のたびにスキル全文や検査ツールを読み込む必要はない。
- 普段の会話や進捗報告では、推敲は内部で行い、返答そのものを出す。
  「書き直した本文」「変えたところ」などの推敲レポートは通常の返答に付けない。

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

# Worktrees

- Create new linked Git worktrees with `wt new <branch> --no-ai`, keeping its sibling
  `<repo>@<branch>` directory layout. Do not use `orca worktree create`, direct
  `git worktree add`, or agent launchers that create another worktree. If `wt` is unavailable,
  stop and report the blocker rather than switching creation methods.
- `wt` is a shell function; load the configured shell environment before invoking it.
- When using Orca, enable the repository's external worktree visibility if needed and verify
  that Orca recognizes the exact checkout path before starting terminals or handing off work.
  Launch agents in that existing checkout without creating another worktree.

# Tool approval explanations

- Before each tool call that requires human approval, explain its purpose and concrete target in
  concise Japanese public text immediately preceding that call in the same assistant message.
  Provide a separate explanation for each call; private reasoning or another call's explanation
  does not satisfy this requirement. An explanation is not authorization or proof of safety.
- If a call is blocked for a missing explanation, provide it before retrying. Do not bypass the
  approval mechanism or treat the explanation as consent.

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
