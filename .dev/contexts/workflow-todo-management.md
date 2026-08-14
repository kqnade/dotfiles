Record schema: implementation-context/v1
Task key: workflow-todo-management-skill
Repository identity method: remote.origin.url
Repository identity: https://github.com/kqnade/dotfiles
Resolved workflow state root: /Users/kanato.momose/repos/github.com/kqnade/dotfiles/.dev
Repository root at write: /Users/kanato.momose/repos/github.com/kqnade/dotfiles
Source worktree: /Users/kanato.momose/repos/github.com/kqnade/dotfiles
Source ref: refs/heads/trunk
Source commit: 007ce93324f6893f0ab9689fd1d6c0d9bc1b0e75
Dirty worktree: yes; final completion increment and two unrelated untracked TODOs
Created: 2026-08-14T18:43:48+0900
Updated: 2026-08-14T18:46:23+0900
Producing client: Codex

# Workflow TODO management implementation context

## Objective and user direction

- User: `.dev`の修理を次の優先作業にするか確認し、その後「じゃあ開始して」と実装開始を
  指示した。
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

## Implemented work

- Commit `547649f`でDesignDocへowner、schema、authorization、concurrency、完了条件を記録し、
  active TODOをtracking対象に追加した。
- Commit `007ce93`でskill routing、Claude materialization、current-worktree path resolver、
  TODO名allowlist、CAS create/update、回帰testを追加した。
- Final incrementで`todo-complete`、TODO限定CAS delete、durable record/checklist gate、
  linked-worktreeと削除範囲の回帰test、shared state contract、`.dev/todo/README.md`を整合した。

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

## Remaining work

- このactive TODOに残作業はなく、完了gateを通してTODO fileを削除済み。
- `skill-driven-workflow-persistence.md`と`codex-luna-coordinator-model-availability.md`は別の
  untracked active itemであり、この変更では編集、stage、commitしない。
