# Workflow TODO management skill

## Objective

`.dev/todo/`のactive work itemを一貫して作成、更新、完了できるcanonical workflowを
提供する。

## Confirmed observations

- Observed: `using-workflow-skills`のrouting tableには、`.dev/todo/`の作成、更新、完了を
  所有するskillがない。
  Provenance: `dot_agents/skills/using-workflow-skills/SKILL.md` inspection,
  2026-08-14 Asia/Tokyo.
- Observed: installed workflow skillsには、handoff、review、security auditなど固有成果物の
  ownerはあるが、通常のactive work itemを汎用的に管理するownerはない。
  Provenance: `dot_agents/skills/*/SKILL.md` inspection, 2026-08-14 Asia/Tokyo.
- Observed: 現行のTODO追加は、明示的なuser authorizationとrepositoryの`.dev/todo/`
  contractに基づく直接編集として行われている。
  Provenance: current Codex session, 2026-08-14 Asia/Tokyo.

## Scope

- TODO管理を独立skillにするか、既存workflow ownerの責務として提供するかを決める。
- 作成条件、task keyとfilename、必須schema、更新競合、commit単位checklist、完了時の削除と
  durable recordへの昇格を定義する。
- 明示的なstate write authorizationとcurrent-worktree `.dev/`境界を維持する。
- 選択したownerを`using-workflow-skills`から到達可能にし、代表的な作成・更新・完了経路を
  検証する。

## Non-goals

- すべての小規模作業にTODO作成を強制すること。
- `.dev/`全体のdirectory構成やcontext schemaを同時に再設計すること。
- 完了済みTODOをarchiveとして保持すること。

## Durable records

- [AI支援開発workflow](../designdoc/ai-assisted-development.md): canonical owner、schema、
  state-write境界、concurrency、完了条件の正本。
- [実装context](../contexts/workflow-todo-management.md): 最終incrementで作業、失敗、検証証跡を
  保存する。

## Commit checklist

- [x] TODO管理のcanonical ownerとlifecycle contractを決定し、必要なDesignDocまたはADRへ
  記録する。
- [ ] `todo-management` skillを追加し、routingとcross-client materializationの回帰testを
  Greenにする。
- [ ] current-worktree限定のpath解決とCAS付きcreate/updateを実装し、state-write境界と
  concurrencyの回帰testをGreenにする。
- [ ] durable recordとchecklistの完了gate、CAS付き削除を実装し、作業contextを保存して
  active TODOを削除する。
