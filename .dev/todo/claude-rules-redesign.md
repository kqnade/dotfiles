# Claude rules / skills再設計

- 状態: Claude制御境界のfollow-up実装中
- DesignDoc: [AI支援開発workflow](../designdoc/ai-assisted-development.md)
- ADR: [Herdr上の同一CLIでAdversarial Reviewを行う](../adr/0001-herdr-adversarial-review.md)
- 調査: [Claude Codeの指示設計に関する調査](../research/claude-code-guidance.md)

## 目的

常時読み込むruleを最小化し、Sanity Review、Adversarial Review、TDD、commit粒度、
`.dev`正本、PR本文の人間執筆を一貫したworkflowとして再構成する。

## Commit単位TODO

- [x] Commit 1: `.dev`へ調査、DesignDoc、ADR、移行TODOを追加し、全agentから正本を
  発見できるようにする。
- [x] Commit 2: 開発、Sanity Review、Adversarial Review、context handoff、shipの
  workflow skillを再構成する。
- [x] Commit 3: 新rule、権限、hook、review agent、旧ruleと重複skillの削除を一つの
  Claude runtime replacementとして反映する。
- [x] Commit 4: `allow` / `ask` / `deny`の代表的な境界をrepository validatorで
  検証する。
- [x] Commit 5: Claude公式仕様に合わせ、review skillの実行境界とrepositoryごとの
  account認可を強制可能な形へ修正する。
  - document化されていないskillの`disallowed-tools`を削除する。
  - specialistとconsultation subagentは`tools` allowlistでread-onlyにする。
  - Herdr上のClaude reviewerは`--tools`と`--disallowedTools`でlocal readだけに絞る。
  - built-in commit / PR workflowを無効化し、custom ruleとskillを正本にする。
  - 社用accountであることと対象repositoryへの利用許可を別々に確認する。
- [ ] Commit 6: sourceをchezmoi runtimeへ反映し、直接検証の証跡と再開地点を
  `.dev/contexts/`へ記録する。

各commitは依存先を同じcommitか前のcommitに持ち、checkoutした中間状態でも参照切れを
起こさない。チェックは実際にcommitを作成した時点で更新する。

Commit 5はprompt、frontmatter、settingsから成る宣言的な制御面であり、振る舞いを
Redにするunit testを先行させられない。代替検証として、YAML parse、無効fieldの`rg`、
agentのtool集合、Adversarial ReviewのCLI引数、描画後settings、既存permission
validatorを直接確認する。

## 検証

- `python3 scripts/ci/validate-repository.py`
- `git diff --check`
- `zsh -n dot_claude/hooks/executable_*.sh`
- `allow` / `ask` / `deny`の代表的な権限境界をrepository validatorで検証
- chezmoiで描画したsettingsのJSON parseとPreToolUse hook decisionの直接test
- skill / agent frontmatterのYAML parseと、旧skill参照、Codex自動参照、
  PR本文生成指示の`rg`監査
- Herdr上で擁護側・反証側の独立reviewを行い、重要な結論が両立する場合は初回で終了、
  decision-changingな未解決の対立がある場合だけ1往復のcross-examination

権限境界のRedでは不足しているremote write確認と`Bash(git *)`の過剰許可を
repository validatorで検出した。contextのGit追跡、PR review投稿境界、
旧project-local ruleの検出は、それぞれ対象を直接実行して確認した。修正後はpath指定
stagingと通常commitだけを自律許可し、それ以外の外向き・広域操作を確認へ分離した。

## Follow-up

- [x] background専用tabの3列＋coordinator上下分割と`done`通知のmechanics test
- [x] Claude制御境界のCommit 5
- [ ] runtime反映とcontext記録のCommit 6
