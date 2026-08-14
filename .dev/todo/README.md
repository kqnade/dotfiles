# Active work

このdirectoryには未完了のwork itemだけを置く。各fileはcommit単位のchecklistを持ち、
最終itemを完了したcommitで削除する。

管理対象のfileは小文字英数字で始まり、小文字英数字、`.`、`_`、`-`だけを使うtask keyから
`.dev/todo/<task-key>.md`として命名する。`Objective`、`Scope`、`Non-goals`、
`Durable records`、`Commit checklist`を持ち、明示的に認可された`todo-management`
workflowだけがcurrent worktree内で作成、更新、完了する。

完了後も必要な設計判断は`.dev/designdoc/`または`.dev/adr/`へ残す。詳細な対話出力、
実施内容、失敗、検証は`.dev/contexts/`へ記録し、削減しない。複数work itemで再利用する
確認済み知識だけを`.dev/memory/`へ抽出する。完了済みTODOのarchiveはGit historyを使う。
