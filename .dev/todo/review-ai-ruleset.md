# AI rulesetの見直し

- [x] AI voice共通templateと4 clientの配備先を削除し、chezmoiとrepository validationで
  削除結果を確認する。
  - TDD対象となるruntime behaviorではないため、source / removal invariantをrepository
    validatorへ追加し、`chezmoi diff`で4 targetの削除予定を確認した。
  - `python3 scripts/ci/validate-repository.py`と`git diff --check`は成功した。
- [x] global rules、settings、skills、agents、OpenCode bridgeの責務と重複を監査し、
  変更候補と推奨順をresearchへ記録する。
  - Claude / OpenCodeの現行一次資料、repositoryの設定と履歴を突き合わせた。
  - 監査結果は[AI ruleset監査](../research/ai-ruleset-audit.md)へ記録した。
- [x] 監査結果から採用する変更を合意し、実装をcommit単位へ分解する。
  - Claude-centric構成を採用し、OpenCodeへClaude固有ruleをmirrorしない。
  - 未配線・重複・未使用のhook、skill、agentを削除する。
  - `Friendly Japanese`は`Japanese`へ変更し、toneではなく会話言語だけを指定する。
- [x] OpenCodeのself-update、重複instruction、permission driftを修正し、validatorで固定する。
  - Red: validatorは`autoupdate: true`を検出して期待どおり失敗した。
  - Green: mise-owned self-update停止、標準`AGENTS.md`二重読込の解消、Gitとpackage操作の
    allow / ask / deny境界を反映し、repository validatorとJSON parseが成功した。
- [ ] OpenCodeのClaude rules bridgeをsourceとruntime removalへ登録し、validatorで固定する。
- [ ] Claudeの未配線hook、重複skill、未使用agentを削除し、reviewer triggerと言語指定を
  整理してvalidatorで固定する。
- [ ] runtimeへapplyし、driftと全体validationを確認して作業記録を完了する。

## 前提

- RulesとSkillsの構成変更は、提案と合意を経てから実装する。
- `conversation-context-export`と`sanity-review`は維持する。
- 現在`Proposed`のAdversarial Review / Sanity Review再設計を、合意前にruntimeへ反映しない。

## 関連資料

- [AI支援開発workflow](../designdoc/ai-assisted-development.md)
- [Adversarial ReviewとSanity Reviewの再設計](../designdoc/adversarial-sanity-review.md)
- [AI ruleset監査](../research/ai-ruleset-audit.md)
- [trunk 対話コンテキスト](../contexts/trunk-94879c6585.md)
