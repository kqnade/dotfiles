# AI client運用

Cursor CLIを標準で導入し、会社用Claude Codeは明示的に選択したマシンにだけ導入します。
認証情報とセッションは各clientが管理します。

## インストール

```sh
# Cursor CLIを含む標準構成
bash install.sh

# 会社用Claude Codeも導入
bash install.sh --with-work-claude
```

選択はchezmoiのローカル設定に保存します。通常の`mise run apply`でも保持されます。
既存マシンでは`chezmoi edit-config`で次のbooleanを設定し、`mise run apply`を実行しても有効化できます。

```toml
[data]
claude_work_enabled = true
```

未設定は`false`です。無効な型や環境変数の値はエラーになります。
macOS、Fedora、Arch Linuxと対応するWSLで同じ選択を使えます。

標準のtool pinは`mise.toml`、会社用Claude Codeのpinは`mise.work.toml`にあります。
取得情報はそれぞれ`mise.lock`と`mise.work.lock`に保持します。`apply`は有効な場合だけwork manifestをtrustし、
`mise -E work install --locked claude`で導入します。ホームのmise設定にも有効なtoolだけを配置します。
Claudeの設定、hooks、Skillsのリンクも有効な場合だけ配備します。
ただし、既存の認可hookがある場合は、無効なマシンでもCursorとの互換性を保つためそのhookだけ更新します。

`claude_work_enabled = false`に戻すと配備・更新と管理wrapperからの起動を止めます。
インストール済みbinary、認証情報、セッション、既存のClaude設定は自動削除しません。

Cursor CLIは`cursor-agent`で起動します。初回は`cursor-agent login`で利用するaccountを確認してください。
Claudeのログインは承認済みの仕事用accountで行います。インストール自体はログインを実行しません。

## 指示と設定

| 対象 | 正本 |
|---|---|
| repository固有の制約・検証コマンド | 各repositoryの`AGENTS.md` |
| Claude固有の指示 | `CLAUDE.md`、`.claude/rules/` |
| Claudeの設定・保護 | `.chezmoitemplates/claude-settings.json.tmpl`、`dot_claude/` |
| 共通のuser instructions | `dot_agents/AGENTS.md` |
| 共通のworkflow Skills | `dot_agents/skills/` |
| 会社用Claudeの導入選択 | chezmoiローカル設定の`data.claude_work_enabled` |

共通指示は`~/.agents/AGENTS.md`、Skillsは`~/.agents/skills/`に配備します。
Claudeには`~/.claude/CLAUDE.md`と`~/.claude/skills/<name>`からリンクします。
Cursorではrepositoryの`AGENTS.md`、利用可能なSkills、および `~/.cursor/rules/` へ配備する
薄い alwaysApply rule を使います。この rule は `$HOME` が workspace の祖先であるときだけ届きます。
`$HOME` 外の checkout では project の `.cursor/rules/` に同じ file を置きます。詳細は
[開発workflow](ai-workflows.md)です。Cursor IDE の Application Support settings.json は管理しません。

既存の`~/.claude/CLAUDE.md`がregular fileなら、適用前に内容を比較してください。
必要な指示を統合・保存するまで置換してはいけません。自動backupは行いません。

Claudeは`claude-md-and-agents-md`設定で`CLAUDE.md`と`AGENTS.md`を併せて読みます。
`AGENTS.override.md`だけに必須指示を置かず、許可された仕事用sessionの`/memory`で読み込み元を確認します。
automatic memoryは無効です。必要な引き継ぎは[開発workflow](ai-workflows.md)に従います。
macOSの設定modifierは管理hookを維持し、Orcaなどの追加hookと`tui`を保持します。

## 会社用Claudeの利用範囲

ClaudeはGitHubの`livesense-inc`または`jobtalk`を`origin`に持つrepositoryでだけ使用します。
zsh wrapper、`UserPromptSubmit`、`PreToolUse`で確認し、originなし、Git repository外、未対応URLも拒否します。
owner確認はログイン中のaccountの検証やOSレベルの隔離ではありません。
会社の内容を個人用accountや未承認のサービスに渡してはいけません。

Cursorは既定でClaudeのuser hooksも読み込みます。repository認可hookは、Cursorのversion情報を持つ
`preToolUse`と`beforeSubmitPrompt`をClaudeのイベントと区別し、会社用Claudeのowner制限を適用しません。
Cursorのterminalから実際にClaudeを起動した場合は、通常どおりClaudeの制限を適用します。
Cursorの利用accountとデータの扱いは、そのrepositoryの規約に従ってください。

LinuxのHerdr integrationは会社用Claudeが有効な場合だけ導入します。macOSではOrcaを使います。

## 管理ファイルの削除と検証

適用時は`.chezmoiremove`に列挙した廃止済みの管理ファイルだけを削除します。
認証情報、セッション、一覧にない独自のSkillsや設定、インストール済みpackageは削除しません。
一覧にある設定ファイルは追加したキーも含めて削除するため、必要な内容は適用前に保存してください。
廃止したCodex使用量exporterとDSH用Ollamaの管理サービスは、停止してから定義を削除します。
停止に失敗した場合は適用を失敗させます。モデルデータは削除しません。

```sh
mise exec -- python3 -B scripts/ci/test-ai-clients.py
mise exec -- python3 -B scripts/ci/test-claude-settings.py
mise exec -- python3 -B scripts/ci/validate-claude-authorization.py
mise exec -- python3 -B scripts/ci/test-client-workflow-reset.py
mise exec -- python3 -B scripts/ci/validate-repository.py
chezmoi diff
```

テストは一時directoryとstub CLIを使い、会社のrepositoryや認証情報を読みません。
完全な配備には`mise run apply`を使い、適用後は新しいshellとclient sessionで確認します。
配置のテストだけでは、実sessionの読み込みやaccountの確認を保証しません。

## 参照

- [Claude instructions / AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)
- [Cursor CLI](https://cursor.com/docs/cli/overview)
- [CursorのClaude hooks互換機能](https://cursor.com/docs/reference/third-party-hooks)
- [Cursor hooksの入力形式](https://cursor.com/docs/hooks)
