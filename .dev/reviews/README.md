# Reviews

- 状態: 履歴
- 更新日: 2026-11-24

`.dev/reviews/` は現行の配置先ではない。canonical area は `.dev/todo/README.md` のとおり
`.dev/designdoc/`、`.dev/adr/`、`.dev/research/`、`.dev/contexts/`、`.dev/memory/`、
`.dev/security/` だけである。

review の結果は `claim-review` が会話へ返す。review artifact は作らない。
引き継ぎは、明示の保存依頼があるときだけ `handoff` が `.dev/contexts/<task>.md` に書く。
この directory に record を作成・更新しない。

旧 contract は、削除済みの `evidence-review` と、存在しない persistence tracker を
前提にしていた。その writer は復活させない。本文は Git history に残る。
