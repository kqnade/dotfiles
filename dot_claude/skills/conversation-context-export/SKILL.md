---
name: conversation-context-export
description: >-
  PRとSanity Reviewに使う詳細な対話出力、実施作業、設計判断、失敗、制約、検証証跡を
  Git追跡する`.dev/contexts/`へexportする。既存contextを削減しない。ユーザーが明示的に
  publishを求めた場合だけ、日本語の折りたたみPRコメントとして公開する。
argument-hint: "[repository | publish]"
---

# 対話コンテキストのexport

contextは特定のbranch、変更、PRに紐づく詳細な対話出力と作業証跡である。別sessionの
作業者とSanity Reviewが、設計判断と実施内容を証拠から再検証できる粒度で記録する。
contextはmemoryではなく、無関係なtaskへ横断的に読み込ませない。

## 1. 対象を特定する

`git symbolic-ref --quiet HEAD`、`git rev-parse --short HEAD`、`git worktree list
--porcelain`を確認する。detached HEADではbranch固有のcontextを安全に識別できないため
停止し、branchを作るか明示的なhandoff名をユーザーに確認する。改行の有無でhashが
変わらないよう、次のコマンドをそのまま使う。

```bash
full_ref=$(git symbolic-ref --quiet HEAD)
branch_name=${full_ref#refs/heads/}
readable_slug=$(printf '%s' "$branch_name" | sed 's#[/\\:*?"<>|]#-#g')
ref_hash=$(printf '%s' "$full_ref" | git hash-object --stdin | cut -c1-10)
context_id="${readable_slug}-${ref_hash}"
context_path=".dev/contexts/${context_id}.md"
```

`$context_path`を現在のworktreeの出力先にする。これにより`feature/a`と`feature-a`を
別のcontextとして扱う。

既存ファイル、関連するactiveな`.dev/todo/`、そこから参照されるDesignDoc、ADR、調査結果を
先に読む。Gitのstatus、対象commit、diff、実行済みの検証結果も確認する。
`.dev`の各文書が正本であり、contextは対話出力、実施したAI作業、判断材料を横断して
PR単位で記録する。

新形式のファイルがなく、旧形式の`.dev/contexts/<readable-slug>.md`だけがある場合は、
内容を読んで新形式へ移行する。旧ファイルを無断で削除しない。

## 2. テンプレートへ記録する

[TEMPLATE.md](TEMPLATE.md)を省略せずに読み、各セクションを埋める。該当する情報が
ないセクションは削除せず「該当なし」と書き、未確認との違いを明確にする。

- 事実、推論、決定を混同しない。
- 採用案は、根拠と依存する前提を記録する。
- 却下案は、比較した利点と不採用理由を記録する。
- 失敗した試行は、操作、観測結果、判断を分ける。
- 検証は、コマンドまたは観測と結果を対応付ける。証拠なしに成功を主張しない。
- 意図的な非対応と、単に未着手の作業を分ける。
- 対象commit、変更path、実行command、結果をreview可能な粒度で記録する。
- 未完了の次作業がある場合だけ、`.dev/todo/`のcommit単位の項目へリンクする。
- 作業完了時は、詳細な対話出力、実施作業、失敗、制約、検証証跡、判断材料をcontextへ
  追加する。ADR、DesignDoc、researchへlinkしてもcontextの作業記録を削減しない。
- 情報を正本へ移した後はTODOへのリンクを残さず、完了した計画自体をcontext内の
  archiveとして複製しない。
- 複数work itemで再利用する確認済み知識は`project-memory`で`.dev/memory/`へ抽出する。
  memory作成を理由にcontextを要約、移動、削除しない。

変更ファイル一覧やコードから自明な実装説明は書かない。会話で得た理由、制約、
反証可能な前提、再発しやすい難所を優先する。日本語で書き、識別子、コマンド、
原文引用は元の表記を保つ。

## 3. 既存記録を更新する

同一sessionでも別sessionでも、既存の詳細な対話出力、実施作業、失敗、検証、判断材料を
削減・削除しない。追試で反証した場合は当時の操作と観測を残し、現在の結論を追記する。
`Exported by`は既存の貢献者を保持して追記する。

`.dev/contexts/*.md`は判断過程を追跡するrepository recordである。関連するTODOや実装と
同じcommitへ含めるか、独立してreview可能なcontext更新としてcommitする。exportだけを
理由に無関係な変更をstageしない。repository外への公開は次のsectionの明示確認を通す。

## 4. 明示された場合だけPRコメントへ公開する

既定はrepositoryへのexportだけで終了する。`$ARGUMENTS`に`publish`があるか、現在のユーザー
指示がPRコメントへの公開を明示している場合だけ、このsectionを実行する。PRが存在する
という理由だけで公開してはならない。

対象PR、repository visibility、local context path、投稿bodyのbyte数を提示し、公開の
確認を取る。現在の指示が対象PRと公開操作を明示済みなら、その指示を確認として扱える。
投稿bodyにcredential、token、private key、個人情報、公開対象外の内部情報がないかを
確認し、疑いがあれば投稿せずユーザーへ報告する。

ローカルファイルをplain Markdownのまま保ち、GitHubへ投稿する本文だけを次の形式で
包む。

```markdown
<!-- ai-conversation-context:<context-id> -->
<details>
<summary>AIとの対話コンテキスト（<branch> @ <short-sha>）</summary>

<contents of .dev/contexts/<context-id>.md>

</details>
```

issue commentsから完全一致するmarkerを探す。現在のGitHubユーザーが投稿した最新の
一致コメントだけを更新し、なければ新規作成する。他者のコメントは編集しない。旧形式
markerが現在のbranchに対応する場合は、同じユーザーのコメントだけを新形式へ移行する。
一時body fileと`gh pr comment --body-file`または`gh api`を使い、生成したMarkdownを
shell引数へ埋め込まない。

PR本文を作成、編集、補完、または文案提示してはならない。最後にrepository内のpath、
source commit、repository-onlyかpublish済みか、PRコメントURL、未確認事項を報告する。
