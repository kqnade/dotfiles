# Skill-driven workflow persistence

## Objective

CodexとClaudeのautomatic memoryが無効であることを前提に、各canonical workflow skillが
発生させる保存義務をactive work itemで追跡し、必要な証拠、判断、handoffをcurrent
worktreeの`.dev/`へ確実に永続化できる設計にする。

## Requirements

- すべての会話や小規模作業を保存するのではなく、各skillが保存要否を常に判定する。
- 保存すべき内容は、保存先へ書かれるまで未解決のpersistence obligationとして追跡する。
- obligationはdurable artifactへのlink、または保存不要と判断した明示的な理由によって
  closeする。
- 次のagentはtask-relevantなactive TODOとそこからのlinkだけで、未解決の保存義務と
  必要なcontextを特定できる。
- `.dev/`はautomatic memoryの代替ではなく、skill-drivenなrepository-owned external
  memoryとして扱う。

## Confirmed observations

- Observed: 現行の`using-workflow-skills`は、明示handoffとmulti-session security auditに
  persistent stateを提供するが、すべてのcanonical ownerに共通するpersistence contractは
  定義していない。
  Provenance: `dot_agents/skills/using-workflow-skills/SKILL.md` inspection,
  2026-08-14 Asia/Tokyo.
- Observed: `evidence-review`のreportは会話へ返す契約であり、専用のdurable review artifactは
  現在定義されていない。
  Provenance: `dot_agents/skills/evidence-review/SKILL.md` inspection,
  2026-08-14 Asia/Tokyo.
- Observed: `.dev/todo/`はcommit単位のactive workを追跡するが、persistence obligationの
  登録、解決、完了gateは現在のcontractに含まれていない。
  Provenance: `.dev/todo/README.md` inspection, 2026-08-14 Asia/Tokyo.

## Proposed model

- 各canonical skillに`required`、`conditional`、`none`のpersistence policy、保存先、
  checkpoint条件、完了条件、昇格条件を定義する。
- stateful skillを開始した時点で、active TODOへ未解決のpersistence obligationを登録する。
- skillの成果物を`reviews/`、`contexts/`、`security/`、`research/`、`adr/`、`designdoc/`、
  `memory/`などの責務に沿った領域へ保存する。
- final TODOは、すべてのobligationがartifactへのlinkまたは不要理由でcloseされるまで
  完了させない。
- `.dev/`のartifact contract、owner skill、routing、lifecycleの対応関係を一つの正本で
  管理し、skill側の重複定義やdriftを検出する。

## Scope

- installed canonical workflow skillsを棚卸しし、persistence policyとartifact ownerを
  対応付ける。
- active TODOにおけるobligation schema、登録、更新競合、close、完了gateを設計する。
- review resultを含む不足artifactの保存先とlifecycleを決める。
- `using-workflow-skills`、各owner skill、`.dev/` DesignDocの責務を整合させる。
- routed skillにpersistence contractがあることと、代表的なobligation lifecycleを
  検証するtestを追加する。

## Non-goals

- automatic memoryを有効化すること。
- すべてのskill実行、会話、command outputを無条件に保存すること。
- stateを必要としない単一sessionの小規模作業にactive TODO作成を強制すること。
- legacy contextを同じincrementで現行schemaへ一括変換すること。

## Related active work

- [Workflow TODO management context](../contexts/workflow-todo-management.md): obligationを保持する
  active work itemのcanonical ownerとlifecycleを提供する。

## Durable records

- [AI支援開発workflow](../designdoc/ai-assisted-development.md): `.dev/` taxonomy、workflow、
  state-write境界の正本。
- [Workflow TODO management context](../contexts/workflow-todo-management.md): active TODOの
  lifecycle、実装、検証証跡。

## Commit checklist

- [ ] `.dev/` artifact taxonomy、canonical owner、skillごとのpersistence policy、obligation
  lifecycleを設計し、DesignDocまたはADRへ記録する。
- [ ] active TODOへobligationを安全に登録・closeする最小workflowと完了gateを実装し、
  concurrencyとstate-write境界のtestをGreenにする。
- [ ] canonical skillsと`using-workflow-skills`を新contractへ整合させ、各routed skillのpolicy、
  review artifact、cross-client materializationを検証する。
