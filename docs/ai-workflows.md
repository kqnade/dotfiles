# 開発workflow

## 必要な手順だけ読み込む

| 依頼 | Skill | 完了条件 |
|---|---|---|
| 実装・不具合修正 | `test-driven-development` | 対象の振る舞いと関連テストを検証し、sanitizerを通す |
| 差分・依存更新のレビュー | `evidence-review` | 根拠付きの指摘、検証範囲、不確実性を返す。sanitizerも確認する |
| 保存・再開 | `context-handoff` | 必要な状態だけ保存、または現在のコードと照合して再開する |
| 成果物の文章点検 | `sanitize-artifacts` | 会話・編集過程に依存した不要な記述を残さない |

通常は各Skillのdescriptionから選択します。全Skillを読むルーターや起動時の手順注入はありません。
依存更新の詳細チェックは、そのレビューでだけ読み込みます。

`sanitize-artifacts`は単独でも使え、開発・レビューでは必須です。未解消の問題があれば完了や
承認を止めます。review-onlyの依頼では指摘だけ返し、勝手に修正しません。

小さな変更は対象コード、テスト、差分を直接扱い、別の計画書、TODO、委譲を一律には要求しません。
Piの共通指示では、検証済みの実装・設定変更は原則として小さなlocal commitで完了します。
repositoryの承認規則や明示的なno-commit指示を優先し、read-only作業ではcommitしません。
commitは`git cc`形式と1Password SSH署名を必須とし、remote変更には別の明示的な許可が必要です。

委譲は独立して検証できる一つの変更か調査に絞り、範囲・完了条件・検証・返す根拠を指定します。
結果を確認してから依存する次の作業を渡し、実装全体と完了処理を一人のworkerへまとめません。
複雑・高リスクな作業では独立したレビューを追加します。並列実装が必要なら先に共有
インターフェースを決め、writerごとにworktreeを分けます。

## 配備と呼び出し

正本は`dot_agents/skills/<name>/`で、`~/.agents/skills/<name>/`へ配備します。
Piはこの場所を直接検出します。Claudeは`~/.claude/skills/<name>`から同じdirectoryへのsymlinkで
読み込みます。Pi用に重複したSkillは作りません。Codex CLIなど、この共通directoryを検出する
他clientからも利用できますが、仕事用データへの利用許可を与えるものではありません。

| 操作 | Pi | Claude |
|---|---|---|
| 開発 | `/skill:test-driven-development` | `/test-driven-development` |
| レビュー | `/skill:evidence-review` | `/evidence-review` |
| 引き継ぎ | `/skill:context-handoff` | `/context-handoff` |
| 成果物の点検 | `/skill:sanitize-artifacts` | `/sanitize-artifacts` |

コマンドの後ろに対象と依頼内容を付けます。たとえば引き継ぎでは「この作業を指定ファイルへ保存」
か「このファイルから再開」かを指定します。名前だけの呼び出しは保存先や保存権限の指定ではありません。

適用には`mise run apply`を使います。Piは`/reload`、Claudeは`/skills`で利用可能なSkillsを確認し、
必要ならsessionを再起動します。配置の検証と、実際の依頼で適切に選択されることの検証は別です。

## 実行と認可

Skillsは現在の利用者の依頼、repository規約、client/accountの制限に従います。
仕事用Claudeと個人用Piの起動保護は[AI client運用](ai-clients.md)のとおり維持します。
別accountへの転送、remoteへの投稿、push、共有環境変更の権限はSkillから発生しません。

委譲には現在のclientの認可された仕組みを使い、その実行規約に従います。Piでは`pi-subagents`、
Claudeでは認可された同accountの仕組みを使い、利用できないときに別CLIへ切り替えません。
Piのexecution guardは`PI_EXECUTION_GUARD=1`で有効にするopt-inです。通常起動ではremote認可は
指示による制約です。native childrenにも`subagents.defaultExtensions`からextensionを配備しますが、
有効時は対話UIのない子の編集・shell実行を拒否します。子の人間向け承認経路は未実装であり、
通常の委譲実装にはまだ使えません。Pi子agentの`permissions: ask`はLLM判断で、人間の許可では
ありません。extension listや環境設定でguardを外した子、外部processにはこのguardが及びません。
OrcaやHerdrでのterminal操作は、その操作が必要な依頼に限ります。Skillにmodelやterminalを固定しません。

## このrepositoryの状態保存

- `.dev/`はcurrent worktreeの状態の正本です。automatic memoryではありません。
- 保存・更新は、その作業の状態保存を明示的に依頼された範囲でだけ行います。
  普通の実装やレビューは、それだけでは状態保存を要求しません。
- 引き継ぎは`.dev/contexts/<task>.md`に置き、目的、制約、決定、現在地、検証、次の行動を残します。
  コードや差分を複製せず、重要な事実の参照先と検証コマンドを記載します。
- `.dev/todo/`を使う場合は未完了作業だけを置きます。完了時には必要な証拠を先に保存し、
  判断・設計・調査は適切なADR、DesignDoc、researchなどに置きます。会話全体の保存は不要です。
- 既存recordを読み、writerを一つにし、更新前に再読して競合を確認します。並行変更があれば
  調整してから更新し、盲目的に上書きしません。別worktreeの記録を混ぜません。
- 決定や失敗の証拠を失う要約置換は避けます。secret、credential、未確認のraw patchは保存しません。
- 保存義務の台帳、独自lock/CAS helper、snapshot bundleは要求しません。
  他repositoryで使う場合は、そのrepositoryのより厳しい保存規約を優先します。
- 読み込み時は記録と現在のコード・Git状態を照合します。履歴資料に書かれた未配備helperや
  routerは実行前提にせず、必要な保存先を黙って変えたりignore規則を変更したりしません。

配備と保護の回帰検証は`mise exec -- python3 scripts/ci/test-client-workflow-reset.py`で行います。
一時homeへの反復適用、Claudeのリンク、参照ファイル、未管理ファイルの保持、sanitizerの内容を確認します。
