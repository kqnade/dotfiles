# AI client運用

主に使うclientは、個人用のPi（`openai-codex` provider）と仕事用のClaude Codeです。
共有するのはrepositoryの指示の形式と汎用の作業手順であり、認証情報、session、仕事用の内容や記録ではありません。

## 指示と設定の責務

| 対象 | 正本 |
|---|---|
| repository固有の制約・検証コマンド | 各repositoryの`AGENTS.md` |
| Claude固有の指示 | 必要なrepositoryの`CLAUDE.md`や`.claude/rules/` |
| Claudeの設定・保護 | `.chezmoitemplates/claude-settings.json.tmpl`、`dot_claude/` |
| Piの設定・拡張 | `dot_pi/agent/` |
| Codex CLIの設定 | `dot_codex/`（Piには適用されない） |
| 共通のworkflow Skills | `dot_agents/skills/`、Claude用リンクは`dot_claude/skills/` |

`AGENTS.md`は、コードから推測しにくい制約、実際に必要なコマンド、詳細資料への参照に絞ります。
一般論や手順の大量追加は避け、手順は必要時に読み込む[workflow Skills](ai-workflows.md)へ分けます。
このrepositoryはglobalな開発ルールやAGENTSファイルを配備しません。
未管理の`~/.pi/agent/AGENTS.md`なども変更・削除しません。

### ClaudeのAGENTS.md読み込み

Claude Codeはv2.1.277以降で`AGENTS.md`を読み込めます。一部環境の修正を含むv2.1.281以降を
前提とし、miseで指定するversionを使います。user settingsに次を配備します。

```json
{
  "pluginConfigs": {
    "agents-md@builtin": {
      "options": {
        "instructionFiles": "claude-md-and-agents-md"
      }
    }
  }
}
```

これにより既存の`CLAUDE.md`や`CLAUDE.local.md`があっても`AGENTS.md`を読み込みます。
既存の`@AGENTS.md` importは有効で、同じファイルは二重に読み込まれません。このrepositoryの
`CLAUDE.md`も残します。他repositoryの指示を自動生成・削除・移行することはありません。

読み込み仕様はclientごとに異なります。たとえばClaudeは`AGENTS.override.md`を読みません。
共通の必須指示をそのファイルだけに置かず、nestedな指示も各clientで読み込みを確認してください。
Claudeでは許可された仕事用repositoryのsessionで`/memory`を使って読み込み元を確認します。
新しく読まれる`AGENTS.md`と既存のClaude用指示に矛盾がないかも確認してください。

## 仕事用と個人用の境界

- Claudeは、`origin`がGitHubの`livesense-inc`または`jobtalk`の場合だけ使用します。
  zsh wrapperの起動前確認、`UserPromptSubmit`、`PreToolUse`の認可hookを維持します。
  originなし、Git repository外、未対応URLも拒否します。承認済みClaude accountを使う必要があり、
  owner確認自体がログイン中のaccountを検証するわけではありません。
- macOSの設定modifierは、管理対象hookを正規設定へ戻し、同じeventにあるOrcaなどの追加hookと
  `tui`を保持します。既存eventや空配列で保護hookを上書きできないようにします。
- Piのzsh functionは`~/.local/bin/pi-telemetry`を呼びます。このlauncherはGitが解決したorigin URLを
  調べ、同じ仕事用ownerなら認証情報取得やPi起動より先に拒否します。SSH/HTTPS等のGitHub URL、
  `insteadOf`、subdirectory、linked worktreeに対応し、telemetry無効時も確認します。
  Git設定の読み取り失敗は起動失敗として扱います。
- Piの確認は既知の仕事用ownerの誤起動防止です。originなしの新規repositoryやGit repository外での
  個人作業は許可します。任意のSSH host aliasや別remote、起動後の他repository参照、直接binaryや
  SDKから起動する経路までは保護しません。仕事の内容を個人用Piや外部サービスへ渡さないでください。
- Piのproject trustはsandboxではありません。必要ならOS accountや隔離環境、credentialのscopeで
  制限します。Claudeの起動保護もOSレベルの隔離の代わりにはなりません。

## 検証と引き継ぎ

小変更は対象テストと差分確認を基本とし、複雑・高リスクな変更は計画確認と独立したレビューを
追加します。reviewは同じ認可範囲のclient/accountで行い、並列のwriterはworktreeを分けます。
完了報告には実行した検証と未確認事項を残します。

Claudeのautomatic memoryは無効のままです。`.dev/`を持つrepositoryではそのrepositoryの規約に
従い、必要な引き継ぎだけを記録します。利用可能なSkillsとこのrepositoryの保存規約は
[開発workflow](ai-workflows.md)にまとめています。

このrepositoryで設定変更を検証する場合:

```sh
mise exec -- python3 scripts/ci/test-claude-settings.py
mise exec -- python3 scripts/ci/test-pi-telemetry.py
mise exec -- python3 scripts/ci/test-client-workflow-reset.py
mise exec -- python3 scripts/ci/validate-repository.py
git diff --check
```

テストは一時directoryとstub CLIを使い、仕事用repositoryの内容を読んだりClaudeへ送信したり
しません。適用前に差分を確認し、完全な配備には`mise run apply`を使います。適用後は新しいshellと
client sessionで確認してください。sourceとfixtureの検証だけでは実sessionの読み込み確認にはなりません。

## 参照

- [Claude instructions / AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- [Pi configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md)
- [Pi security](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
