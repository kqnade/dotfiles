# AI支援開発workflow

- 状態: 共通層を責任分割優先へ再設計済み
- 更新日: 2026-11-16

## 目的

AI の速度を使いながら、責任境界・観測可能な振る舞い・人間が書く説明を分けて追跡できるようにする。
AI の出力自体を根拠にせず、実装と確認結果を突き合わせて判断する。

## 正本の優先順位

1. コードの責任分割と呼び出し方
2. その境界で保証する観測可能な振る舞い（要るときだけテスト）
3. 人間が書く PR 説明（Agent は箇条書き素材のみ）
4. 結論先・短い箇条書きの会話

## `.dev/` の正本

- `.dev/todo/`: 未完了作業の active state。durable destination ではない
- `.dev/designdoc/`: 設計
- `.dev/adr/`: 重要な選択と却下理由
- `.dev/research/`: 一次資料と調査結果
- `.dev/contexts/`: 詳細な実施内容、失敗、検証証跡
- `.dev/memory/`: 複数 work item で再利用する確認済み知識
- `.dev/security/coverage.md` と `.dev/security/reports/`: security ledger / report

上記 durable area だけを canonical taxonomy とする。別 worktree の record を混ぜない。
state write は明示依頼があるときだけ行う。

## 共通 Skills

正本は `dot_agents/skills/`。配備先は `~/.agents/skills/`。

| Skill | 用途 | 完了条件 |
|---|---|---|
| `responsibility-boundary` | 実装・不具合修正 | 責任を切り、呼び出し方と実装を分け、要るときだけ外から観測できる契約を確認する |
| `claim-review` | レビュー | 主張・確認方法・責任境界・実装の整合を根拠付きで返す。review-only |
| `handoff` | 明示の保存・再開 | 薄い Markdown を保存するか、現在状態と照合して再開する |

旧 `test-driven-development`、`evidence-review`、`sanitize-artifacts`、`yomiyasu`、
`context-handoff` は削除済み。residue 禁止と PR 人間執筆は `dot_agents/AGENTS.md` に吸収した。

## 開発手順

1. 影響する責任を切る。呼び出し方と実装を混ぜない。
2. 観測可能な振る舞いが変わる境界だけ契約テストを足す。既存の比例した確認で足りるなら足さない。
3. 最小実装をする。脆いテスト（実装の写し、private 直叩き、mock だらけ）を増やさない。
4. 成果物に会話過程だけの文言を残さない。
5. 検証済みの実装・設定変更は原則 local commit で閉じる。push / remote 変更は別許可。
6. PR / MR の作成・本文編集は既定禁止。依頼時も箇条書き素材のみ返し、最終文は人間が書く。

## Review

主張（問題認識・採用/不採用理由・影響範囲・確認方法）と実装・責任境界を突き合わせる。
「できた」「指示どおり」だけの説明は不足。指摘は会話へ返し、PR 投稿は別の明示許可がある場合だけ。

## データ境界

- 会社用 Claude は GitHub remote owner が `livesense-inc` または `jobtalk` の repository だけ
- Cursor は標準 client。Claude Code は opt-in
- 承認済みでない account / service へ repository 由来情報を送らない
- automatic memory は無効。必要な引き継ぎは `handoff` と `.dev/contexts/`
