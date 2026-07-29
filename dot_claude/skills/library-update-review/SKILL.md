---
name: library-update-review
description: >-
  Review a dependency or runtime update pull request using release notes, dependency
  graphs, repository usage, version consistency, prior failures, and verification.
argument-hint: "[PR URL or number]"
---

# ライブラリ更新レビュー

依存関係またはruntime更新PRを、通常のfeature PRとは分けてレビューする。報告は
日本語で記述し、package名、version、コマンド、引用は原文を保つ。

## 1. 更新範囲

- PR差分から直接更新されたpackage・runtimeと変更前後のversionを確定する。
- lockfileから追加・更新・削除されたtransitive dependencyを確認する。
- botやPR本文の説明を根拠にせず、manifestとdiffを正本とする。
- 意図した更新と関係が説明できないlockfile churnを指摘する。

## 2. 公式情報

変更前から変更後までに含まれる各releaseについて、公式release note、changelog、
migration guide、security advisoryを確認する。技術的な主張は一次情報へリンクする。

確認する内容:

- breaking change、deprecation、既定値・動作の変更
- repository内で使用しているAPIやfeatureへの影響
- security fixとCVE
- 必要なruntime、peer dependency、platform条件
- より新しいmajor versionの有無と、今回そこまで上げない理由

情報へアクセスできない場合は推測せず「未確認」とする。

## 3. Repositoryへの影響

package名、import、旧version、新versionをrepository全体で検索する。以下を含む:

- application codeとtest
- manifestとlockfile
- Dockerfile、CI、devcontainer、miseなどの開発環境
- code generation、build、deploy設定
- documentationとexample

versionの完全一致だけでなく、range、alias、対応runtimeも確認する。API変更に必要な
code/config migrationと、同時に揃えるべきversion指定を列挙する。

## 4. Risk

- 新しいtransitive dependency、install script、binary配布、maintainer変更
- database、network、filesystem、crypto、authなど重要経路への影響
- repository内の過去のissue・PR・revert・closed update
- rollback方法と、更新を見送る場合の影響

重大な論点に対立する見解がある場合は`adversarial-review`を使い、一次証拠で裁定する。

## 5. Verification

変更箇所に対応するtest、build、lint、typecheckを確認する。packageのversion表示や
runtime起動など、実際に更新物が使われたことを示す観測も含める。

## 6. Report

```markdown
# ライブラリ更新レビュー

## 更新範囲
## 公式release情報
## 使用箇所とversion整合性
## 移行の必要性
## 依存関係・security risk
## 過去の失敗
## 検証結果
## 未確認事項
## 結論
```

レビュー依頼だけではPRへのcomment・label付与・code変更を行わない。PR本文を生成・
書き直ししない。不足情報は指摘するが、貼り付け用の代替文章は作らない。
