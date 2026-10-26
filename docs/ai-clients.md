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
| DeepSeek Harnessの構成・profile | `dot_config/deepseek-harness/`、`dot_dsh/` |
| Codex CLIの設定 | `dot_codex/`（Piには適用されない） |
| 共通のagent instructions | `dot_agents/AGENTS.md`、各clientのadapterからsymlink配備 |
| 共通のworkflow Skills | `dot_agents/skills/`、Claude用リンクは`dot_claude/skills/` |

`dot_agents/AGENTS.md`を`~/.agents/AGENTS.md`へ配備し、各clientのuser-level instructionsから
同じファイルへsymlinkを張ります。

| Client | 配備先 |
|---|---|
| Pi | `~/.pi/agent/AGENTS.md` |
| Claude | `~/.claude/CLAUDE.md` |
| Codex CLI | `~/.codex/AGENTS.md` |
| OpenCode | `~/.config/opencode/AGENTS.md` |

既存のregular fileがある場合、初回適用前に内容を比較します。同一内容ならmanaged symlinkへの
置換を確認して適用でき、異なる内容なら必要な指示を統合して保存するまで適用してはいけません。
`chezmoi apply`は既存targetを置換するため、unknown home filesの保持規則はこのmanaged targetには
適用されません。既存ファイルの自動移行やbackupは行いません。

Codex CLIに`~/.codex/AGENTS.override.md`がある場合、そちらが優先されます。独自の`CODEX_HOME`や
client設定directoryを使う場合、その配備先は別途準備してください。配備によってclient/accountの
利用範囲が変わることはありません。

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

## DeepSeek Harness

DeepSeek Harnessはmiseの`npm:@deepseek-ai/dsh`で管理し、TUIには`@sagmans/dsh-tui`を使います。
どちらもdeveloper previewに対応する固定versionです。profileごとに`DSH_HOME`を分け、
認証、session、設定、pluginのインストール先を共有しません。

| 起動 | 保存先 | 親agentのモデル | 外部subagent |
|---|---|---|---|
| `dsh personal` / `dsh-personal` | `~/.dsh/personal/` | Codex契約認証、Ollama | なし |
| `dsh work` / `dsh-work` | `~/.dsh/work/` | Ollama | Claude Code |

Web UIは`dsh personal web`または`dsh work web`で起動します。個人用は
`http://127.0.0.1:3080`、仕事用は`http://127.0.0.1:3081`で待ち受け、既定のbrowserを開きます。
自動で開かない場合は`--no-open`を付け、端末に表示されるtoken付きURLから接続してください。
このURLは共有しないでください。待受先とportを変更する引数は受け付けません。

同じ用途のTUIとWebは`DSH_HOME`、認証、sessionを共有します。個人用と仕事用の間では
共有しません。Webにも同じモデル構成を適用し、Webの設定は各homeの
`profiles/web/cordis.patch.yml`に保存します。Webのモデル選択には画面のモデルメニューを使います。
仕事用Webはrepositoryの親など、任意のdirectoryから起動できます。フォルダ追加時にserver側の
pluginがGitの全originを確認し、GitHubの`livesense-inc`／`jobtalk`以外は拒否します。
originを読めないdirectoryも追加できません。symlinkは実体のpathで判定します。
初回の既定フォルダは自動登録せず、会社のrepositoryを選んで追加します。
wrapperは`web-required.patch.yml`を必須overlayとして渡し、pluginが有効になるまでWeb serverを起動しません。
既存のworkspaceや過去のsessionからの復元は変更しません。

初回のセットアップとCodexへのログインは次のとおりです。

```sh
mise install npm:@deepseek-ai/dsh
mise run apply
mise run dsh-setup
dsh personal login
```

`dsh-setup`は個人用・仕事用それぞれのTUIとWebに固定版のCLIとpluginをインストールします。各profileは同じ
依存treeのCLIとpluginで起動します。セットアップではagentを起動せず、Claudeの認証も読み取りません。
bootstrapにも同じインストール処理が含まれます。管理するbundleとversionは
`dot_dsh/`のmanifestで指定し、モデルの初期設定は`dot_config/deepseek-harness/`に置きます。
初期モデルは各bundleの`agent-default-model`で指定します。TUI内の`/model`は実行中の
sessionのモデルを切り替えます。TUIで保存した外観などの設定は、各homeの
`profiles/tui/cordis.patch.yml`に残ります。

個人用のCodexは`openai-codex` providerを通じてHarnessから直接呼び出します。Codex CLIを
subagentとして起動しません。`login`は`@sagmans/dsh-provider-extra`のログイン専用CLIを使い、
OAuth認証を個人用Harnessの`.credentials.yaml`へ保存します。このpackageのprovider bundleは
有効にせず、既存のPiやCodex CLIの認証情報もコピーしません。

Ollamaの接続先は両方とも`http://127.0.0.1:11434/v1`、モデルは`qwen3.8:27b-mlx`です。
OllamaはmacOSのLaunchAgent、Linuxのsystemd user serviceとしてmiseで管理します。
`mise run apply`でログイン時の起動と異常終了時の再起動を設定します。待受はloopbackだけに限定し、
macOSのログは`~/Library/Logs/ollama.{log,err}`、Linuxのログはuser journalへ出力します。
モデルのダウンロードは自動化しません。未取得なら次のように取得してください。

```sh
ollama pull qwen3.8:27b-mlx
dsh personal
```

TUI内で`/model ollama/qwen3.8:27b-mlx`を実行するとOllamaへ切り替わります。
Codexに戻す場合は`/model openai-codex/gpt-6-luna`を使います。wrapperは`--model`と
`--provider`を受け付けず、モデル選択はTUI内で行います。

仕事用の親agentはOllamaを使い、`subagent_claude_code`でClaudeへ依頼します。Claudeは
公式Agent SDKに同梱されたruntimeで実行され、hostの通常のClaude設定と承認済みaccountを
使います。zshの`claude` functionを経由するわけではありません。`permissionMode: dontAsk`により、
未許可の操作を対話なしに拒否します。Claudeへのログインは承認済みの仕事用環境で行ってください。

仕事用Web以外では、起動wrapperが認証を読む前にGitが解決した全originを確認します。
仕事用TUIはGitHubの`livesense-inc`／`jobtalk`だけを許可し、個人用はそのownerを拒否します。個人用ではoriginなしの
作業も許可します。継承されたAnthropic、OpenAI、DeepSeekの認証変数は起動時に除きます。
profileやpatchを差し替えるCLI引数はwrapperから渡せません。

この確認は誤起動防止でありsandboxではありません。起動後の別repositoryへの移動、任意のshell
操作、直接binaryからの起動まで隔離するものではありません。profileへ仕事用credentialを
コピーせず、仕事の内容を個人用の認証や外部サービスへ渡さないでください。

### 個人用の New Relic telemetry

`dsh personal` の TUI と Web UI は、モデル呼び出し、ツール実行、セッション、ターン、サブエージェントの集計を OTLP/HTTP で既存の New Relic へ送ります。
service 名は `deepseek-harness`、scope は `dsh.telemetry` です。
`dsh.request.count`・`dsh.request.duration`・`dsh.token.usage` と
`dsh.tool.count`・`dsh.tool.duration` を記録し、対応する span と本文を含まないイベントログも送ります。
属性は provider、model、個人用 profile、tool 名、親／子の区分、終了理由、成功／失敗などに限定します。
会話本文、ツール引数・出力、ファイルパス、認証情報、エラー本文は含めません。

#### ダッシュボード用の指標

| 指標 | 内容 |
| --- | --- |
| `session.count` | agent の作成・読込回数。`source` は `startup` / `resume` / `clear` / `compact` |
| `session.loaded` / `session.active` | プロセス内の読込済み数／実行中の数。毎秒の gauge |
| `session.duration` | 読込から破棄までの時間。待機時間を含む |
| `turn.count` / `turn.duration` | 開始と終了を観測できたターン数／処理時間 |
| `turn.interrupted.count` / `request.interrupted.count` | 中断したターン／モデル試行の数 |
| `request.first_response.duration` | 試行開始から最初の非空テキスト・推論・ツール呼出デルタまでの時間 |
| `request.retry.count` / `request.retry.started.count` | リトライ待機の予約数／待機後に再試行へ進んだ数 |
| `request.retry.delay` | リトライの予定待機時間 |
| `request.error.count` | request-error フックで観測した失敗数。開始前の失敗も含む |
| `cost.estimated.usage` | API単価換算の推定USD。実請求額ではない |
| `cost.coverage.count` | 試行ごとの料金取得状況。`status` は `estimated` / `unavailable` |
| `subagent.started.count` | 再開を含むサブエージェントの稼働開始数 |
| `subagent.count` / `subagent.duration` | 開始と終了を観測できた稼働期間の数／時間 |
| `subagent.usage.unavailable.count` | 使用量を取得できない外部サブエージェントの終了数 |

表の指標名にはすべて `dsh.` を付けます。時間の単位はミリ秒です。
count と usage は差分カウンターなので合計し、duration は gauge として平均・最大値を使います。
新規セッション数は `source = 'startup'`、再開数は `source = 'resume'` で分けます。
clear・compact を新規会話数へ足さないでください。履歴を引き継ぐ新規forkも startup に含まれ、
`agent_role = 'root'` / `'subagent'` で親子を分けられます。
セッション指標には provider・model を付けません。ターンは最初のモデル試行の解決済みルートに帰属させ、
モデル試行のないターンは unknown とします。ターン途中でモデルを変更した場合も、各試行の使用量はその試行のモデルへ帰属します。

loaded・active にはプロセスごとのランダムな `instance` を付けます。
複数プロセスでは直近の短い期間にある各 instance の最新値を合計し、サンプル値自体は合計しません。
通常終了時はゼロを送りますが、強制終了・通信断では最後の値が残るため、古い instance を除外してください。
この値は保存済みセッションの総数ではありません。

error_class は rate_limit・authentication・server・client・timeout・network・unknown に限定します。
モデル試行の終了指標にも、取得できた失敗分類を付けます。
request.error.count と失敗した request.count は重なり得るため、足し合わせません。
初回応答時間には推論やツール呼出も含まれ、画面に最初の文章が表示されるまでの時間とは異なります。
何も応答しなかった試行には初回応答時間を記録しません。

#### 料金と使用量

推定料金には、起動中のDSHが依存する pi-ai の静的 openai-codex カタログを使います。
認証処理やプロバイダーのコードは実行せず、公開モデルデータだけを読み込みます。
モデルIDを完全一致させ、キャッシュを含む入力総量で単価の段階を選びます。
サブスク料金、割引、税、電力費などは含まず、請求額を示す指標は送りません。
料金不明のモデル、Ollama、使用量不明、キャッシュ保存期間を判別できない料金体系は unavailable です。
不明な料金をゼロとして補いません。カタログを読み込めない場合はローカルに警告し、他の計測は続けます。
推定額には `currency = 'USD'` と `pricing_source = 'pi_ai_catalog'` を付け、
セント未満を丸めず送ります。料金計算では pi-ai アダプターが省略するゼロのキャッシュ数をゼロとして扱い、
推論トークンを出力へ二重加算しません。集計額と併せて coverage の unavailable 件数を確認してください。

モデル使用量は各試行の最後の usage を一度だけ計上します。未取得の使用量をゼロとして補いません。
入力・キャッシュ読み取り・キャッシュ書き込みは DSH の区分を維持します。

キャッシュヒット率には `dsh.cache.token.usage` を使います。非キャッシュ入力とキャッシュ読取が
どちらも非負の安全な整数で、合計が正の安全な整数になる試行だけを、`type=input` と `type=cache_read` のペアで記録します。
計算式は DSH TUI 0.16.0 と同じ「キャッシュ読取 ÷（キャッシュ読取＋非キャッシュ入力）」です。
キャッシュ書込と出力は分母に含めません。リクエストごとの率を平均せず、トークン数を合計してから割ります。
例えば10トークンを全て再利用した試行と、90トークンを全て新規入力した試行の合計は10%です。

```sql
FROM Metric
SELECT 100 * filter(sum(dsh.cache.token.usage), WHERE type = 'cache_read')
  / sum(dsh.cache.token.usage) AS 'Cache hit %'
WHERE service.name = 'deepseek-harness'
FACET provider, model
SINCE 1 hour ago
```

DSH の累積表示は未取得のキャッシュ読取をゼロとして扱いますが、この集計では不明な試行を分子・分母の両方から除外します。
通常の `dsh.token.usage` は取得できた値を従来どおり記録します。
有効な試行がなければ率は算出できません。adapter が未知の値を既にゼロへ変換している場合、その区別は復元できません。
DSH 画面は履歴を含むセッション累積、New Relic は送信できた試行の指定期間の集計なので、表示値の一致は保証しません。

request の時間はライブストリーム開始から確定まで、tool の時間は呼び出しから結果までのミリ秒です。
ネストしたツールには親 span を付けます。親の `run_code` と子の時間は重なるため、単純に合計しません。
履歴の読み直しは集計せず、ローカル子 agent の使用量は自身のストリームから一度だけ計測します。
その試行の解決済み provider・model と `agent_role = 'subagent'` を使い、親モデルへ帰属させません。
サブエージェントの稼働開始・終了は `backend` と `local` で区別します。
backend は委譲先の種類であり、LLM の provider ではありません。起動前に失敗した委譲は起動数に含みません。
常駐中の追加指示は起動数を増やさず、終了後の再開は別の稼働期間として数えます。
外部Codexなどの使用量・実行モデルはDSH 0.2.1-rc.2の公開イベントにないため取得不可です。
ゼロ使用量や親のモデルを代入せず、外部子 agent の内部処理は集計しません。
タイトル生成など、agent ストリームを通らない直接 LLM 呼び出しも対象外です。

キーは `DSH_NEW_RELIC_API_KEY`、`NEW_RELIC_LICENSE_KEY`、管理する 1Password 参照の順に取得します。
取得は origin の認可後に行い、失敗した場合は起動を止めます。
`DSH_NEW_RELIC_ENABLE=0 dsh personal` で明示的に無効化できます。
仕事用、login、help、list-models ではこのプラグインの計測を有効にせず、専用キーも渡しません。
DSH 標準のフィードバック送信設定は変更しません。

送信処理は Pi と同じソースを chezmoi で配置します。毎秒のバッチ送信と終了時の flush を行い、
通信失敗やキュー超過はローカルに警告します。キューはメモリ内のみで、終了時の未送信分は失われます。
通信失敗時は再試行とタイムアウトにより終了が遅れることがあります。
反映には `mise run apply` を使い、DSH を再起動してください。

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
mise exec -- python3 scripts/ci/test-dsh-profiles.py
mise exec -- python3 scripts/ci/test-dsh-plugins.py
mise exec -- node --test scripts/ci/test-dsh-workspaces.mjs
DSH_TEST_WEB_PROFILE="$HOME/.dsh/personal/profiles/web" mise exec -- node --test scripts/ci/test-dsh-workspaces.mjs
mise exec -- node --test scripts/ci/test-dsh-telemetry.mjs scripts/ci/test-dsh-dashboard.mjs scripts/ci/test-dsh-cost.mjs scripts/ci/test-dsh-pricing.mjs
mise exec -- python3 scripts/ci/test-ollama-service.py
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
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [OpenCode rules](https://opencode.ai/docs/rules/)
- [Pi configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md)
- [Pi security](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
