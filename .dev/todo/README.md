# Active work

この directory には未完了の work item だけを置く。各 file は commit 単位の checklist を持ち、
最終 item を完了した commit で削除する。

管理対象の file は小文字英数字で始まり、小文字英数字、`.`、`_`、`-` だけを使う task key から
`.dev/todo/<task-key>.md` として命名する。最低限 `Objective`、`Scope`、`Non-goals`、
`Durable records`、`Commit checklist` を持つ。

`.dev/todo/` は transient な active state であり、durable destination ではない。durable artifact の
canonical area は `.dev/designdoc/`、`.dev/adr/`、`.dev/research/`、`.dev/contexts/`、
`.dev/memory/`、`.dev/security/`（`coverage.md` と `reports/`）だけである。

作成・更新・完了は、利用者がその state write を明示的に依頼したときだけ行う。別 worktree の
record を混ぜず、完了前に必要な判断と証跡を durable area へ残す。

## Persistence obligations

必要な場合だけ `## Persistence obligations` を置く。欠落または空でも有効である。entry ごとに
stable lowercase slug の見出しを置き、`Owner`、`Policy`（`required` / `conditional` / `none`）、
`State`（`open` / `closed`）を必須とする。さらに repository root からの `.dev/` 相対 path である
`Destination`、または空白でない具体的な `No-save reason` のどちらか一方だけを置く。

```markdown
## Persistence obligations

### `example-obligation`
- Owner: `handoff`
- Policy: `conditional`
- State: `closed`
- Destination: `.dev/contexts/example.md`
- Artifact: [context](../contexts/example.md)
```

現行の semantic owner は次のとおり。

| Owner | Policy | 既定 |
|---|---|---|
| `responsibility-boundary` | `none` | 実装と境界契約の確認が成果。独自の durable write は要求しない |
| `claim-review` | `none` | 指摘は会話へ返す。durable review artifact は作らない |
| `handoff` | `conditional` | 明示の保存依頼時だけ `.dev/contexts/<task>.md` へ書く |

完了後も必要な設計判断は `.dev/designdoc/` または `.dev/adr/` へ残す。詳細な対話出力、実施内容、
失敗、検証は `.dev/contexts/` へ記録する。完了済み TODO の archive は Git history を使う。
