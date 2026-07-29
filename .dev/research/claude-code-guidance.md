# Claude Codeの指示設計に関する調査

- 調査日: 2026-07-29
- 状態: 採用判断へ反映済み

## 問い

Claude Codeへ常時読み込ませるruleと、必要時だけ読むskillをどう分けるべきか。

## 一次資料

- [Steering Claude Code: Skills, hooks, rules, and subagents](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)
- [Using CLAUDE.md files](https://claude.com/blog/using-claude-md-files)
- [Lessons from building Claude Code: How we use skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)
- [Configure permissions](https://code.claude.com/docs/en/permissions)
- [Hooks reference](https://code.claude.com/docs/en/hooks)

## 確認できた方針

- 常時読み込む指示は、プロジェクト全体で変わらない制約へ絞る。
- Claudeがコードから判断できる説明や、特定言語だけの詳細を常時指示へ重複させない。
- 複数手順を伴う作業はskillへ分離し、必要時だけ手順本文を読み込ませる。
- skillのdescriptionは、処理内容だけでなく起動すべき状況を判定できる記述にする。
- 詳細なtemplateやreferenceはskill本体から分離し、必要な時だけ読む。
- 絶対に守る必要がある禁止事項をmodelへのruleだけに依存させず、permissionまたは
  deterministicなPreToolUse hookで実行境界を作る。
- permissionはdeny、ask、allowの順に評価され、content-scopedなaskはsandboxの
  auto-allowより優先される。
- Claude Codeはread-onlyなGit commandを組み込み判定する。`Bash(git *)`のような
  namespace全体のallowは`git -c alias...`も許可するため、local mutationに必要な
  `git add`と`git commit`だけをallowする。
- Bash permission patternはcommand文字列に対するguardrailであり、OS-levelの境界では
  ない。外部writeはask、破壊操作はdenyまたはhook、credentialとfilesystem/networkの
  強制分離が必要な環境はClaude Code sandboxまたは会社のmanaged settingsを併用する。
- GitHub pluginは`gh`を経由せずPR、issue、review、repositoryを変更できる。read toolは
  制限せず、GitHub MCP serverのwrite系tool名だけをaskへ上げる。
- `gh`のmutation verbと`gh api`はPR以外もaskへ上げる。`curl`、`wget`、HTTPieの
  POST、PUT、PATCH、DELETE、form/data/uploadもPreToolUseで確認へ上げる。
- `Read`/`Edit`のpath denyはBash subprocessに適用されない。`.env`、`secrets/`、
  `*.pem`、`*.key`をcommand文字列に含むBashはPreToolUseで確認へ上げる。
- Artifact toolはsession出力をclaude.ai上のpageへ公開するため無効化する。自動取得される
  claude.ai connectorも無効化し、承認済みpluginだけを明示的に有効化する。
- PreToolUseの構造化decisionはstdoutへJSONを出してexit 0にする。exit 2ではstdoutの
  JSONが無視されるため、`ask`として機能しない。

## このリポジトリへの適用

- ruleは`coding.md`、`development.md`、`review.md`の3ファイルに限定する。
- 言語別の一般論、説明用skill、TDD専用skillは削除し、開発workflowへ統合する。
- Sanity Review、Adversarial Review、会話contextのexport/importは手順固有のskillとして残す。
- templateの情報密度は下げず、本文から分離してprogressive disclosureを保つ。
- `acceptEdits`でlocal editを自律実行させ、path指定のstagingと通常commitを許可する。
  bulk staging、amend、Git alias、削除、差分破棄、remote/package管理、PR操作は
  `permissions.ask`で確認する。GitHub MCPのmutation toolも同じ確認点にする。
- `disableArtifact`と`disableClaudeAiConnectors`で、workflow外の公開・connector経路を
  閉じる。
