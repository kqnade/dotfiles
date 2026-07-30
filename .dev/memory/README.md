# Project memory

`.dev/memory/`には、複数のwork itemで再利用する確認済み知識だけを置く。

## Contextとの境界

- `.dev/contexts/`は特定のbranch、変更、PRに紐づく詳細な対話出力と作業証跡である。
  PRとSanity Reviewの対象なので、完了後も削減・削除しない。訂正時は当時の観測を残し、
  現在の結論を追記する。
- `.dev/memory/`は将来のtaskで利用するためにcontext、ADR、research、codeから抽出した
  repository scopedな知識である。根拠が変われば更新またはsupersedeできる。

Contextをmemoryの代わりに横断的に読み回さず、memory作成を理由にcontextを要約・削除しない。
Claude Codeのbuilt-in auto memoryは無効のままにし、memoryはGitでreview可能にする。

## Entry

topicごとに一つのMarkdown fileを作り、次を記載する。

- 状態: Active / Superseded
- Scope: 適用対象
- Verified at: 最終確認日とcommit
- Sources: context、ADR、DesignDoc、research、code、commitへのlink
- Memory: 次の作業で利用できる確認済みの知識
- Invalidate when: 再確認が必要になる条件

secret、credential、個人profile、未確認の推論、作業log、PR固有の詳細はmemoryへ置かない。
