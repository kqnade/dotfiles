# 開発workflow

## 必要な手順だけ読み込む

| 依頼 | Skill | 完了条件 |
|---|---|---|
| 実装・不具合修正 | `responsibility-boundary` | 責任を切り、呼び出し方と実装を分け、要るときだけ外から観測できる契約を確認する |
| 差分・変更のレビュー | `claim-review` | 主張・確認方法・責任境界・実装の整合を根拠付きで返す |
| 保存・再開 | `handoff` | 必要な状態だけ保存する、または現在のコードと照合して再開する |

通常は各 Skill の description から選択する。全 Skill を読むルーターや起動時の手順注入はない。

普段の返答には `dot_agents/AGENTS.md` の方針を適用する。結論を先に、根拠は箇条書き。
事実・条件・不確実性は保ち、流暢さのための自動推敲はしない。

成果物に会話過程・依頼文脈にしか意味がない文言を残さない。未解消の residue は完了を止める。
review-only の依頼では指摘だけ返し、勝手に修正しない。

小さな変更は対象コード、既存の確認、差分を直接扱い、別の計画書・TODO・委譲を一律には要求しない。
共通指示では、検証済みの実装・設定変更は原則として小さな local commit で完了する。
repository の承認規則や明示的な no-commit 指示を優先し、read-only 作業では commit しない。
commit は gitmoji 形式のメッセージと 1Password SSH 署名を必須とし、remote 変更には別の明示的な許可が必要。
PR / MR の作成・本文編集は既定禁止。依頼時も問題 / やったこと / やらなかったことと理由 /
想定影響 / 動作確認の箇条書き素材のみ返し、最終文は人間が書く。

設定済みの New Relic などへの通常の telemetry 送信は既定運用に含まれ、送信ごとの個別承認は不要。
明示的な無効化の依頼がなければ、agent は exporter や wrapper を無効化しない。送信先や収集内容の変更、
任意のデータ upload、remote collector 設定の変更には明示的な許可が必要で、client/account や機密情報の
制限は維持する。

Orca が使える環境では、repository 変更は main checkout より task 専用の linked worktree を優先する。
同じ task の worktree があれば再利用し、新規作成には `wt new <branch> --no-ai` を使う。Orca で扱う前に
external worktree の表示と実際の checkout path を確認する。read-only 作業では新規作成は不要。

委譲は独立して検証できる一つの変更か調査に絞り、範囲・完了条件・検証・返す根拠を指定する。
結果を確認してから依存する次の作業を渡し、実装全体と完了処理を一人の worker へまとめない。
複雑・高リスクな作業では独立したレビューを追加する。並列実装が必要なら先に共有
インターフェースを決め、writer ごとに worktree を分ける。

## 配備と呼び出し

正本は `dot_agents/skills/<name>/` で、`~/.agents/skills/<name>/` へ配備する。
Claude は `~/.claude/skills/<name>` から同じ directory への symlink で読み込む。
Cursor は repository の `AGENTS.md`、利用可能な Skills、および alwaysApply rule を使う。
`dot_cursor/rules/agents.mdc` は `~/.cursor/rules/` に配備する。Cursor は workspace から祖先の
`.cursor/rules/` を読む。`$HOME` が祖先でない checkout ではこの rule に届かない。その checkout では
同じ file を project の `.cursor/rules/` に置く。rule 本文に必須の短い契約を書き、
`~/.agents/AGENTS.md` は全文の正本とする。参照だけでは本文の代わりにならない。
この範囲は Cursor の project rules と CLI が project の `AGENTS.md` を読むという文書に合わせた。
pin している `cursor-agent` `2026.11.13-eacade1` で、`$HOME` 外の workspace を起動して測ってはいない。
配備は仕事用データへの利用許可を与えるものではない。

| 操作 | Claude |
|---|---|
| 開発 | `/responsibility-boundary` |
| レビュー | `/claim-review` |
| 引き継ぎ | `/handoff` |

コマンドの後ろに対象と依頼内容を付ける。たとえば引き継ぎでは「この作業を指定ファイルへ保存」
か「このファイルから再開」かを指定する。名前だけの呼び出しは保存先や保存権限の指定ではない。

適用には `mise run apply` を使う。Claude は `/skills` で利用可能な Skills を確認し、
必要なら session を再起動する。配置の検証と、実際の依頼で適切に選択されることの検証は別。

## 実行と認可

Skills は現在の利用者の依頼、repository 規約、client/account の制限に従う。
会社用 Claude の導入選択と起動保護は [AI client運用](ai-clients.md) のとおり。
別 account への転送、remote への投稿、push、共有環境変更の権限は Skill から発生しない。

委譲には現在の client で認可された同 account の仕組みを使い、その実行規約に従う。
利用できない場合に別 CLI や account へ切り替えてはいけない。API 判定や agent の返答は、
remote 変更に必要な人間の事前認可の代わりにはならない。
Orca や Herdr での terminal 操作は、その操作が必要な依頼に限る。Skill に model や terminal を固定しない。

## この repository の状態保存

- `.dev/` は current worktree の状態の正本。automatic memory ではない。
- 保存・更新は、その作業の状態保存を明示的に依頼された範囲でだけ行う。
  普通の実装やレビューは、それだけでは状態保存を要求しない。
- 引き継ぎは `.dev/contexts/<task>.md` に置き、目的、制約、決定、現在地、検証、次の行動を残す。
  コードや差分を複製せず、重要な事実の参照先と検証コマンドを記載する。
- `.dev/todo/` を使う場合は未完了作業だけを置く。完了時には必要な証拠を先に保存し、
  判断・設計・調査は適切な ADR、DesignDoc、research などに置く。会話全体の保存は不要。
- 既存 record を読み、writer を一つにし、更新前に再読して競合を確認する。並行変更があれば
  調整してから更新し、盲目的に上書きしない。別 worktree の記録を混ぜない。
- 決定や失敗の証拠を失う要約置換は避ける。secret、credential、未確認の raw patch は保存しない。
- 読み込み時は記録と現在のコード・Git 状態を照合する。履歴資料に書かれた未配備 helper や
  router は実行前提にせず、必要な保存先を黙って変えたり ignore 規則を変更したりしない。

配備と保護の回帰検証は `mise exec -- python3 scripts/ci/test-client-workflow-reset.py` で行う。
一時 home への反復適用、Claude のリンク、Cursor rule、参照ファイル、未管理ファイルの保持を確認する。
