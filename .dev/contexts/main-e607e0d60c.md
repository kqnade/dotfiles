# main Claude rules / skills再設計コンテキスト

- PR: export時点でPR未作成
- Branch: `main`
- Context ID: `main-e607e0d60c`
- Source commit: `940a1f2`
- Updated at: 2026-07-29 Asia/Tokyo
- Exported by: Codex
- 状態: Claude制御境界の再監査中に中断・再開待ち

## 目的

Claudeへ大量の常時ruleを与える方式をやめ、AIを自律的に動かしながら、判断過程、
local変更、remote writeを人間が追跡・管理できる開発workflowへ再設計する。

## 正本へのリンク

- TODO: [Claude rules / skills再設計](../todo/claude-rules-redesign.md)
- DesignDoc: [AI支援開発workflow](../designdoc/ai-assisted-development.md)
- ADR: [Herdr上の同一CLIでAdversarial Reviewを行う](../adr/0001-herdr-adversarial-review.md)
- 調査: [Claude Codeの指示設計に関する調査](../research/claude-code-guidance.md)

## 会話で確定した要件・制約

- commitは小さく、review・revert・追跡できる単位にする。
- inline commentはcodeから読めないWhyだけに限定する。
- behavior変更はRedを確認してから最小実装を行い、Greenでcommitする。
- TODOはcommit単位へ分解し、`.dev/`を開発記録の正本にする。
- Sanity ReviewとAdversarial Reviewを重要なreview手段として残す。
- PR本文は人間が書き、AIは生成・補完・文案提示しない。
- PR向けのAI commentとreview reportは日本語で書く。
- `.dev/contexts/`を含む会話の判断記録もGitで追跡する。
- ClaudeとGitHub Copilotは社用account、OpenCode、Codex、Kimiは個人accountである。
- このdotfiles repositoryは個人側にあるため、社用Claudeを起動・接続してはならない。

## 設計方針

- 決定: 常時ruleを`coding.md`、`development.md`、`review.md`の3つに絞る。
  - 根拠: 常時contextを減らし、必要な詳細手順だけskillとして遅延読込するため。
  - 依存する前提: workflow skillが具体的な手順と安全境界を保持する。
  - 証拠: `dot_claude/rules/`と`dot_claude/skills/`のsource。
- 決定: local editと計画済みcommitを自律許可し、remote writeと広域・破壊操作を
  `ask`、force push・再帰削除・秘密file accessを`deny`にする。
  - 根拠: AIの作業速度を保ちつつ、外部影響が生じる直前を人間の確認点にするため。
  - 依存する前提: permissionとPreToolUse hookの両方が有効である。
  - 証拠: `dot_claude/settings.json.tmpl`と`dot_claude/hooks/`。
- 決定: 会社repositoryのAdversarial ReviewはHerdrのbackground tabでClaudeを2つ
  起動する。この個人repositoryではClaudeを使わず、Herdrのmechanicsだけを
  repository外の一時directoryで個人Codexによりtestする。
  - 根拠: 会社repositoryを個人accountへ送らず、独立contextと監査可能なpaneを得るため。
  - 依存する前提: `HERDR_ENV=1`で、同じ会社Claude accountを利用できる。
  - 証拠: ADR 0001と`adversarial-review` skill。

## 却下した代替案

- 案: 会社ruleをprivate repositoryへ置き、dotfilesからsubmoduleで取得する。
  - 利点: 会社固有情報を公開repositoryから分離できる。
  - 不採用理由: URLと存在はdotfilesに残り、chezmoi・Git追従・社用環境限定展開の
    複雑さが増える。今回のruleは会社固有情報ではなく一般的な行動境界へ縮小した。
  - 再検討条件: 非公開でなければ保持できない具体的な会社policyが必要になった場合。
- 案: Claudeと個人Codexを自動で対立させる。
  - 利点: model多様性を得られる。
  - 不採用理由: 会社repository由来情報を個人accountへ送る境界を越える。
  - 再検討条件: 会社承認済みaccountと送信許可が用意された場合。
- 案: language・framework別の詳細ruleを常時読み込む。
  - 利点: 個別技術の規約を明示できる。
  - 不採用理由: context競合と陳腐化が増え、repository固有規約よりglobal ruleが強くなる。
  - 再検討条件: 繰り返し起きる具体的なfailureを少量のruleで防げる場合。

## 失敗した試行

- 試行: Claude policyの文言、削除名、Herdr command、hook behaviorを
  `scripts/ci/validate-repository.py`へ網羅的に追加した。
  - 操作: repository validatorへ約379行のClaude専用検証を追加した。
  - 観測: validatorの責務が分からず、文言変更へ過剰に結合した。
  - 判断: 元のrepository検証へ戻し、代表的な`allow` / `ask` / `deny`だけを残した。
  - 証拠: 現在のvalidator差分は44行だけである。
- 試行: foregroundのwaitと反論roundを毎回行った。
  - 操作: reviewerごとに待機・取得し、結論が両立していてもcross-examinationを進めた。
  - 観測: review loopが遅く、人間による確認開始も遅れた。
  - 判断: 2 reviewerを並列起動し、各3件まで、両立する場合は初回で終了する。
  - 証拠: `adversarial-review` skillの完了watcherと停止条件。
- 試行: plugin uninstall後のClaude settingsをそのまま検証した。
  - 操作: CodeRabbitとskill-codexをuninstallした。
  - 観測: Claude CLIが`settings.json`を書き換え、管理中のhookとdenyが一時的に落ちた。
  - 判断: plugin変更後に`mise run apply`を再実行し、chezmoi driftなしを確認した。
  - 証拠: `chezmoi diff`は出力なし、plugin一覧は必要な3件だけである。
- 試行: Completion paneの通知確認で`notification_shown`を待った。
  - 操作: `pane wait-output`のmatchに実際と異なるevent名を指定した。
  - 観測: 両agentと通知処理は完了していたが、外側のwaitだけがtimeoutした。
  - 判断: 実際のeventは`notification_show`である。Completion paneの出力を読んで
    `shown: true`を確認し、正しいmatchでは即時成功した。
  - 証拠: `w1:pB`の`notification_show` event。

## 意図的に対応しないこと

- yaskkserv2のservice再登録はClaude再設計commitへ混ぜない。現在の1178番portは
  2026-07-06から残る旧install pathの`yaskkserv2`がlistenしており、
  `dev.mise.yaskkserv2` plistはmissingである。独立したmachine bootstrap作業として扱う。

## 発見された事実・制約

- Claude Codeは`settings.json`をruntimeで更新するため、plugin操作後はchezmoi sourceを
  再applyする必要がある。
- `Read` / `Edit`のdenyはBash subprocessへ適用されないため、secret pathのshell accessは
  PreToolUse hookでも確認する。
- hookの構造化decisionはstdoutへJSONを出してexit 0にする必要がある。
- Herdrのbackground tabではagent完了状態を`done`として通知paneから待機できる。
- 2026-07-29のmechanics testでは、background tab `w1:t3`を3列に分け、右列を
  Status / Completionへ上下分割できた。Advocate `w1:p8`とChallenger `w1:pA`は
  個人Codexで`done`になり、Completion `w1:pB`から通知が表示された。

## 中断時点のClaude制御境界監査

以下は公式documentとの照合で判明した未反映事項である。まだsource、runtime、commitへ
反映していないため、再開時は実装済みとして扱わない。

- `SKILL.md`の`disallowed-tools`はClaude Codeがdocument化しているskill frontmatterでは
  なく、現在の複数skillに書かれた指定はtool禁止を保証しない。
- skillの`allowed-tools`は指定toolを事前承認するもので、利用可能tool全体を制限しない。
  review実行をread-onlyにする境界はcustom subagentの`tools` allowlist、または独立CLIの
  `--tools "Read,Grep,Glob"`で強制する必要がある。
- 現在のreview agentは`Read`、`Grep`、`Glob`だけを指定しているため、custom subagent側の
  read-only境界は成立している。skill coordinator自体には別途明示的な非変更規約が必要。
- Adversarial ReviewのHerdr起動例は`--kind <current-kind>`のままで、同一Claude CLIを
  強制していない。会社環境向けには`--kind claude`とread-onlyなClaude CLI引数へ固定する
  必要がある。ただし、この個人repositoryで社用Claudeを実行して検証してはならない。
- Claude Codeの`includeGitInstructions`は既定で有効であり、built-inのcommit / PR workflow
  指示を読み込む。PR本文生成を抑止しcustom workflowを正本にするため、
  `settings.json.tmpl`で`false`へ明示する案を監査対象とする。
- 社用accountであることと、対象repositoryの情報を送信してよいことは別の認可である。
  自動workflowはaccount区分だけでなく、repositoryごとの利用許可も満たす必要がある。

## 注意が必要な難所

- chezmoi applyはruntime変更されたtargetごとに上書き確認を求める。sourceを正本として
  全反映する場合はTTYから`all-overwrite`を選ぶ。
- Claude plugin uninstallはplugin一覧だけでなく`settings.json`も再構成する。
- 会社契約か個人契約かはmodel名ではなくaccount単位で判断する。
- このrepositoryでは社用Claudeを利用できない。Claude固有の実reviewは会社側の
  repositoryでのみ実施し、このrepoのmechanics test結果と混同しない。

## 検証証跡

| 対象 | コマンド・観測 | 結果 |
|---|---|---|
| repository | `python3 scripts/ci/validate-repository.py` | 成功 |
| diff | `git diff --check` | 成功 |
| Claude描画 | `chezmoi diff` | 出力なし |
| hook構文 | `bash -n`、`zsh -n`、変更hookへの`shellcheck` | 成功 |
| hook decision | deny / askの代表入力を各hookへ送信 | 期待したdecision、exit 0 |
| skill metadata | Rubyで17件のYAML frontmatterをparse | 成功 |
| plugin | `claude plugin list` | GitHub、gopls、TypeScriptだけenabled |
| doctor | `mise run doctor` | chezmoiは成功、yaskkserv2 serviceだけ失敗、portは成功 |
| Herdr topology | `herdr pane layout --pane w1:p8` | 3列と右列上下分割を確認 |
| Herdr completion | `agent wait --until done`×2、`notification show` | 両agentが`done`、`shown: true` |

## 現在地

- 完了: `.dev`正本、workflow skill、Claude runtime、permission validatorのCommit 1〜4。
  Herdrの3列＋右列上下分割、background `done`、通知表示のmechanics test。
- 作業中: Claude skillのtool制約、Adversarial ReviewのCLI境界、built-in Git指示を
  公式documentと照合する監査。ユーザー指示により変更前に中断。
- 未確認: yaskkserv2の新service再登録。会社repository上のClaude実reviewは、この
  個人repositoryでは実行禁止。

## 次の作業

- TODO: Claude制御境界の未反映事項をsourceへ適用するか判断し、適用する場合は
  skill metadata、Adversarial Review起動引数、`includeGitInstructions`、repository認可の
  順に修正してsource / runtime / validatorを再検証する。
  - 開始条件: 作業再開の指示があること。
  - 最初の操作: 現在のGit状態とClaude公式documentの仕様が変わっていないことを確認する。
- TODO: 中断中のHerdr test tab `w1:t3`を整理する。
  - 開始条件: 作業再開の指示があること。
  - 最初の操作: `advocate_notify`と`challenger_notify`が`done`であることを確認し、
    test結果を保持したまま作成済みtabだけを閉じる。
- TODO: yaskkserv2を新しいmise管理serviceとして再登録する。
  - 開始条件: Claude再設計とは別のmachine bootstrap作業として扱うこと。
  - 最初の操作: 現在の旧processを安全に停止する手順と新plistのapply内容を確認する。
