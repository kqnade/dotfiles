# Large implementation agent routing

## Objective

`route-large-implementation`が、並列unitを安定した
`agent/<task-key>/<unit-key>` branchへdispatchし、各coordinatorが完了またはblocked時に
Herdr経由で親agentへ最小の結果を返せる。既存のworktree分離、client維持、Green commit、
remote mutation禁止の境界は変えない。

## Confirmed observations

- Observed: 現行skillはbranchを`git check-ref-format --branch`で検証するが、命名規則と
  既存branchを意図せず再利用しない条件を定めていない。
  Provenance: `dot_agents/skills/route-large-implementation/SKILL.md` inspection,
  2026-08-16 Asia/Tokyo.
- Observed: 現行Herdr contractはagentの`done`、`idle`、`blocked`状態と、agentへのprompt、
  最終出力のreadを提供している。
  Provenance: `dot_agents/skills/herdr/SKILL.md` inspection,
  2026-08-16 Asia/Tokyo.
- Observed: `herdr-worktree`は既存branchを再利用できるため、router側で明示的なresumeと
  accidental collisionを区別する必要がある。
  Provenance: `dot_local/bin/executable_herdr-worktree` inspection,
  2026-08-16 Asia/Tokyo.

## Scope

- relevantなactive TODOがある場合、そのfilenameのtask keyをbranch identityへ再利用する。
- routerが各independent unitへ安定した小文字の`unit-key`を割り当て、branchを
  `agent/<task-key>/<unit-key>`とする。
- branch全体を`git check-ref-format --branch`で検証し、同名branchは同じunitの明示的な
  resumeである場合だけ再利用する。
- dispatch前に親agentの明示的なHerdr targetを取得し、WHAT/HOW/DONE packetへ含める。
- coordinatorは完了またはblocked時に、`status`、`task_key`、`unit_key`、`branch`、
  `head_sha`、`verification`だけをHerdr経由で親へ返す。broad transcriptは返さない。
- existing Herdr state/read機能を結果回収に使い、polling loopを追加しない。
- repository validatorでbranch identity、collision boundary、parent return contractを検証する。

## Non-goals

- `.dev/todo/`のschema、parser、unit metadataを変更すること。
- `mktemp`、FIFO、Unix socket、WebSocket、`.dev`内mailboxなどの独自IPCを追加すること。
- 各unitへadversarial reviewer、`/side`、旧`sanity-review`を組み込むこと。
- `herdr-worktree` helperのbranch作成・再利用実装を変更すること。
- agent branchの自動merge、push、PR作成、branchまたはworktreeの自動削除。
- `route-large-implementation`のouter topologyとdispatch以外へ責務を広げること。

## Durable records

- None — このwork itemは既存skillの局所的なrouting contractを明文化し、その正本と
  回帰証拠をskillおよびrepository validatorへ直接残すため、別のdurable design recordは
  必要ない。

## Commit checklist

- [ ] `route-large-implementation`のbranch identity、explicit resume、Herdr parent returnを
  repository validatorで先にRedにし、最小のskill変更でGreenにしたうえで、focused validation、
  full repository validation、`git diff --check`を通す。
