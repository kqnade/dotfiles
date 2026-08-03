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
- [ ] 監査結果から採用する変更を合意し、実装をcommit単位へ分解する。

## 前提

- RulesとSkillsの構成変更は、提案と合意を経てから実装する。
- `conversation-context-export`と`sanity-review`は維持する。
- 現在`Proposed`のAdversarial Review / Sanity Review再設計を、合意前にruntimeへ反映しない。

## 関連資料

- [AI支援開発workflow](../designdoc/ai-assisted-development.md)
- [Adversarial ReviewとSanity Reviewの再設計](../designdoc/adversarial-sanity-review.md)
- [AI ruleset監査](../research/ai-ruleset-audit.md)
- [trunk 対話コンテキスト](../contexts/trunk-94879c6585.md)
