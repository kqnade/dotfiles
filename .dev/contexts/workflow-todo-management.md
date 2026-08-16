Record schema: implementation-context/v1
Task key: workflow-todo-management-skill
Repository identity method: remote.origin.url
Repository identity: https://github.com/kqnade/dotfiles
Resolved workflow state root: /home/kqnade/repos/github.com/kqnade/dotfiles@agents-workflow-persistence-lifecycle/.dev
Repository root at write: /home/kqnade/repos/github.com/kqnade/dotfiles@agents-workflow-persistence-lifecycle
Source worktree: /home/kqnade/repos/github.com/kqnade/dotfiles@agents-workflow-persistence-lifecycle
Source ref: refs/heads/agents/workflow-persistence-lifecycle
Source commit: 0e23a5483c9fbb351a9b5e451f949738253a73b7
Dirty worktree at task start: no
Created: 2026-08-14T18:43:48+0900
Updated: 2026-08-16 Asia/Tokyo
Producing client: Codex

## Provenance reconciliation

The metadata above is reconciled to the current worktree for this continuation. The original
record was produced from `/Users/kanato.momose/repos/github.com/kqnade/dotfiles`, with source ref
`refs/heads/trunk`, source commit `cee023643c4410d007524caab3be2bf2cfef75c6`, and a dirty
worktree documented as “this context update and two unrelated untracked TODOs.” Its original
resolved workflow state root was `/Users/kanato.momose/repos/github.com/kqnade/dotfiles/.dev`.
The current task started clean at `0e23a54` in
`/home/kqnade/repos/github.com/kqnade/dotfiles@agents-workflow-persistence-lifecycle`; the
historical facts remain preserved here rather than being silently replaced. No state was
redirected to another worktree or backend.

# Workflow TODO management implementation context

## Objective and user direction

- User: `.dev`の修理を次の優先作業にするか確認し、その後「じゃあ開始して」と実装開始を
  指示した。
- User: 2回のreviewで合計4件のblocking defectを報告し、2回目のreview後にcontextは追記では
  なく最新状態へ更新し、履歴はGitに任せるよう指示した。
- Decision: `.dev/todo/`のlifecycleを先に安定させ、その上にskill-driven persistenceを
  構築できる順序にした。

## Decisions

- Decision: `todo-management`をactive TODO lifecycleの唯一のcanonical ownerにした。
- Decision: active TODOはcurrent Git worktreeの`.dev/todo/`だけに置き、明示的な
  `AGENT_WORKFLOW_STATE_HOME`にもredirectしない。
- Decision: task key、必須section、durable record promotion、commit checklistをschemaとし、
  active TODO自体にはdurable record用identity blockを要求しない。
- Decision: create/update/deleteは既存のrecord lock、atomic replace、expected hash CASを
  再利用し、deleteはeligibleなactive TODOだけに限定した。
- Decision: 完了gateは未完了または空のchecklist、missing/out-of-scope durable link、
  `None`とlinkの混在、stale hash、symlink、nonregular targetを拒否する。
- Decision: checklistではindentと空labelを許容し、Markdown unordered bulletの`-`、`*`、`+`を
  task markerとして認識する。

## Implemented work

- Commit `547649f`でDesignDocへowner、schema、authorization、concurrency、完了条件を記録し、
  active TODOをtracking対象に追加した。
- Commit `007ce93`でskill routing、Claude materialization、current-worktree path resolver、
  TODO名allowlist、CAS create/update、回帰testを追加した。
- Commit `1d719ee`で`todo-complete`、TODO限定CAS delete、durable record/checklist gate、
  linked-worktreeと削除範囲の回帰test、shared state contract、`.dev/todo/README.md`を整合した。
- Commits `0df415a`、`dfdd90c`、`9338e85`でCASなしwrite、空label・nested unchecked task、
  空白だけの`None`理由をそれぞれ拒否し、`dcf6f63`でREADMEのfilename contractを明確化した。
- Commit `cee0236`で`* [ ]`と`+ [ ]`を未完了taskとして検出する回帰testと修正を追加した。

## TDD evidence

- Red: canonical skill setへ`todo-management`を期待値として追加し、未実装skill欠如でexit 1を
  確認した。Green: skill、router、symlink、path helper、writer allowlist追加後にvalidator
  exit 0。
- Red: completion helperを期待値へ追加し、helper欠如でexit 1を確認した。Green: 未完了
  checklistを`unchecked checklist items`で拒否し、既存fileを保持。
- Red: missing durable recordの期待理由を追加し、汎用未実装errorでexit 1を確認した。
  Green: link存在・owned area検証を実装し、fileを保持。
- Red: eligible TODOの削除を期待し、未実装完了gateでexit 1を確認した。Green: shared writerへ
  TODO限定`--delete`を追加し、current hash一致時だけ削除。
- Added Green regression coverage: stale hash、linked-worktree分離、external backend拒否、
  invalid task key、owned area外link拒否、実在context link受理、context record削除拒否。
- Review snapshot `546aa607..1d719ee0`では、CASなしwrite、空label・nested unchecked task、
  空白だけの`None`理由を隔離fixtureで再現し、それぞれ期待理由でRedを確認してGreenにした。
  reviewed diff SHA-256は
  `2e430997da8214facf6b190efbd54a6c0b545a00f423ef41521fbec989b63bd6`。
- Review snapshot `1d719ee..dcf6f63`では、`* [ ] Unfinished verification.`を持つfixtureで
  helperがTODOを削除し、validatorが
  `TODO completion must preserve a star-bullet unchecked item`でRedになった。`* [ ]`と
  `+ [ ]`の両fixtureが内容を保持して完了を拒否するGreenを確認した。reviewed diff SHA-256は
  `a8b7d103cdb2bf50b9365ee02414febc27a1790f091e2390132c0530413173cd`。

## Failed attempts and constraints

- Observed: repository指定の`luna_parallelizer`は、このsessionでは`gpt-5.6-luna`がspawn
  modelとして提供されず起動できなかった。read-only探索は3つのbounded agentへ分割した。
- Observed: `mise exec -- python3 scripts/ci/validate-repository.py`はlocal macOS Python 3.9.6を
  選び、`tomllib`欠如で起動前に失敗した。installed Python 3.11のabsolute pathで同じvalidatorを
  実行した。
- Observed: sandbox内の`git add`は`.git/index.lock`を作れず失敗した。対象path限定で承認を
  得た後にstageし、`git cc`でGreen incrementをcommitした。
- Observed: final helperの一時materializationは、最初にrepository cwdとlogical `/tmp` pathを
  使ってdestination境界に拒否され、次に`.agents/`親directory不足で拒否された。いずれも
  repository fileを変更せず、validatorと同じresolved `/private/tmp` destinationとlayoutで
  再実行して成功した。

## Verification

- Observed: `/Users/kanato.momose/.local/bin/python3.11 scripts/ci/validate-repository.py` exit 0。
- Observed: `shellcheck`を`todo-path`、`todo-complete`、`workflow-state-write`へ実行しexit 0。
- Observed: `git diff --check`は各commit前にexit 0。
- Observed: hash `973410c95578cf3b6a8c39465b693e297320901c`を指定したdeployed
  `todo-complete`がexit 0でactive TODOを削除した。
- Observed: active TODO削除後にrepository validator、ShellCheck、`git diff --check`を再実行し、
  すべてexit 0。
- Observed: commit `cee0236`とこのcontext更新を含むworktreeでrepository validator、3 helperの
  ShellCheck、`git diff --check`を再実行し、すべてexit 0。

## Remaining work

- 既知の4 blocking defectは修正済み。最終判定は再レビュー待ち。
- Linuxとlive CIは未確認。
- `skill-driven-workflow-persistence.md`と`codex-luna-coordinator-model-availability.md`は別の
  untracked active itemであり、この変更では編集、stage、commitしない。

## Persistence-obligation lifecycle foundation (first two unchecked increments)

### User direction and applicability

- Deliver only the first two unchecked increments in `.dev/todo/skill-driven-workflow-persistence.md`.
- The owned scope was `.dev/designdoc/ai-assisted-development.md`, `.dev/todo/README.md`, this
  context, `dot_agents/skills/todo-management/**`,
  `dot_agents/skills/using-workflow-skills/scripts/**`, and
  `scripts/ci/validate-repository.py`. The overarching active TODO was explicitly forbidden to
  edit, as were unrelated canonical `SKILL.md` files.
- `$execute-worktree-implementation` and `$test-driven-development` were explicitly invoked;
  implementation behavior followed one List -> Red -> Green -> Refactor cycle at a time. This
  context-only append has no executable behavior seam, so TDD does not apply to this update;
  deterministic repository, shell, and diff checks are the proportionate evidence below.
- Commits were local only. No push or other remote mutation was authorized or performed.

### Decisions

- The canonical durable taxonomy is `.dev/designdoc/`, `.dev/adr/`, `.dev/research/`,
  `.dev/contexts/`, `.dev/memory/`, and `.dev/security/` limited to `coverage.md` and `reports/`.
  `.dev/todo/`, conversation output, and a new review-only area are not durable artifacts.
- `.dev/todo/` is transient active state. A stateless single-session workflow may omit the TODO and
  the optional `## Persistence obligations` section; no active TODO is forced merely to record
  that work.
- `Owner` is the semantic canonical workflow that creates the obligation. `todo-management` is the
  mechanical owner of TODO storage and lifecycle and is never a semantic obligation owner.
- The canonical policy mapping is `required` (always destination-backed and initially open),
  `conditional` (destination-backed/open when its condition applies, or concretely no-save/closed
  when it does not), and `none` (concrete no-save reason/closed when an entry is recorded).
- The schema is optional and supports zero or more unique stable-slug entries. Each entry has
  canonical `Owner`, `Policy`, and `State` fields plus exactly one `Destination` or concrete
  `No-save reason`; artifact closure adds the matching `Artifact` link while no-save closure removes
  `Destination`.
- Registration, closure, and TODO mutation require explicit state-write authorization; policy,
  workflow invocation, or a destination never implies permission. All resolution is current-
  worktree-only, rejecting external backends, other worktrees, absolute paths, and unsafe paths.
- Registration and closure use the shared record lock, expected-hash compare-and-swap, and
  same-directory temporary-file atomic replacement. Stale hashes or locks require re-read and
  reconciliation; no blind retry or age-only unlock is allowed.
- The interfaces are `todo-obligation register --expect HASH TASK_KEY --id ID --owner OWNER
  --policy POLICY (--destination .dev/... | --no-save-reason REASON)` and
  `todo-obligation close --expect HASH TASK_KEY --id ID (--artifact .dev/... |
  --no-save-reason REASON)`. Artifact closure requires the declared destination to be an existing
  regular non-symlink file in the owner's allowed taxonomy area. A `conditional` obligation may
  close with a concrete single-line no-save reason; `required` cannot use it, while `none` records
  that reason already closed at registration and cannot transition.
- `todo-complete` preserves the existing checklist and durable-record gates, checks every optional
  obligation before deletion, rejects open/malformed/duplicate/unsafe/stale evidence, and performs
  the final TODO deletion through the same CAS writer. A valid durable artifact link or an allowed
  concrete no-save reason is the only closure evidence.

### Red and Green evidence

- Red: the registration validator reported `deployed TODO obligation registration helper is
  missing`; Green: the materialized helper was present and created the canonical required/open
  entry.
- Red: artifact close was absent from the helper interface and the intended invocation returned
  `usage`; Green: `close --artifact` accepted one open obligation, required an exact destination
  match, and emitted the canonical artifact link.
- Red: registration accepted unsafe `.dev/security/unsafe).md`; Green: it rejected the unsafe
  Markdown path and preserved the active TODO unchanged.
- Red: no-save close was artifact-only usage and rejected a conditional `--no-save-reason`;
  Green: conditional no-save closure records the reason, required no-save closure is rejected, and
  artifact/no-save inputs remain mutually exclusive.
- Red: AWK `-v` converted `C:\tmp` in the concrete reason into a tab; Green: the literal
  `Windows path C:\tmp stays session-local.` reason survives closure unchanged.
- Red: completion deleted an active TODO containing an open obligation; Green: the read-only
  obligation check runs before the final CAS delete, preserves the open TODO, and permits deletion
  only for valid closed artifact/no-save obligations.

### Foundation commits (exactly)

- `c578e8a` — docs lifecycle.
- `c95334f` — register obligations.
- `69c05d2` — artifact close and path safety.
- `a76a8e5` — no-save closure and literal reason handling.
- `416924e` — completion gate.

### Changed-path scope

Across this foundation, changes were limited to `.dev/designdoc/ai-assisted-development.md`,
`.dev/todo/README.md`, this context, `dot_agents/skills/todo-management/SKILL.md`,
`dot_agents/skills/todo-management/scripts/executable_todo-obligation`,
`dot_agents/skills/todo-management/scripts/executable_todo-complete`, and
`scripts/ci/validate-repository.py`. No change was needed in the owned
`dot_agents/skills/using-workflow-skills/scripts/**` paths because the existing shared writer and
current-worktree root behavior were reused unchanged.

### Failures and constraints

- In this linked worktree, Git staging required scoped approval because `.git` metadata was
  read-only in the sandbox.
- Repository validation emitted a harmless read-only mise-cache warning; it did not change the
  validation result.
- Live CI and macOS Bash 3.2 execution were not run. No remote mutation was performed.

### Final verification

- `python3 scripts/ci/validate-repository.py` — exit 0.
- Targeted `shellcheck -e SC1091 -S warning` over `executable_todo-path`,
  `executable_todo-complete`, `executable_todo-obligation`, and
  `executable_workflow-state-root`, `executable_workflow-state-candidates`,
  `executable_workflow-state-digest`, `executable_workflow-state-write` — exit 0.
- `bash -n` for `executable_todo-complete` and `executable_todo-obligation` — exit 0.
- `git diff --check` — exit 0.
- `git status --short` — only this context file modified.

### Remaining integration risk

- `.dev/todo/skill-driven-workflow-persistence.md` remains unchecked by explicit instruction.
- The third increment, aligning all canonical skills and cross-client materialization, remains out
  of scope.
- No other canonical skill `SKILL.md` changed; live CI and macOS verification remain unverified.
