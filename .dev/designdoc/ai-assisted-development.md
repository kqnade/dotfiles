# AI支援開発workflow

- 状態: 実装・runtime反映・検証完了
- 更新日: 2026-07-29

## 目的

AIの速度を使いながら、判断過程、実装、テスト、レビューを人間が追跡できる状態に
する。AIの出力自体を根拠にせず、独立した証拠を突き合わせて判断する。

## 正本

開発情報は`.dev/`を正本とする。

- `.dev/todo/`: 未完了作業のcommit単位計画。最終item完了時に削除する
- `.dev/designdoc/`: 実装前後に更新する設計
- `.dev/adr/`: 重要な選択と却下理由
- `.dev/research/`: 一次資料と調査結果
- `.dev/contexts/`: PR対象となる詳細な対話出力、実施内容、失敗、検証証跡
- `.dev/memory/`: 複数work itemで再利用する確認済みのrepository知識

code、test、実行結果も独立した証拠であり、`.dev`の記述と矛盾する場合は矛盾を
解消するまで結論を出さない。

## 開発workflow

1. 作業を独立して検証、review、revertできるTODOへ分解する。
2. 各TODOを一つのcommitへ対応させる。
3. TDDを原則とし、期待する理由でtestが失敗することを確認する。
4. そのtestを通す最小実装を行い、関連testと必要な広域検証を通す。
5. greenになったTODO itemだけをcommitする。最終itemでは、判断をADRまたはDesignDoc、
   調査事実をresearchへ分解し、詳細な対話出力、実施作業、失敗、検証、制約、判断材料を
   contextsへ記録してからTODO fileを削除する。完了済み計画そのものはarchiveとして
   残さない。
6. inline commentはcodeから読めないWhyだけに限定する。

調査、DesignDoc、ADRが必要な変更は、実装TODOより前に作成または更新する。

## 行動の管理境界

AIは依頼範囲内のread、local edit、test、計画済みlocal commitを追加確認なしで進める。
これらはGitで差分と履歴を追跡でき、remoteへ出る前に人間がまとめて判断できる。

次の操作は人間の確認点にする。

- push、PR・issue・comment・release・packageなどのremote writeまたは公開
- productionや共有環境の状態変更
- 復元困難な削除や履歴破壊
- 未承認account・serviceへのrepository由来情報の送信
- 依頼範囲を実質的に広げる変更

modelへのruleだけを強制境界にしない。`permissions.defaultMode`は`acceptEdits`として
local editを自律化する。read-only GitはClaude Codeの組み込み判定へ任せ、path指定の
`git add`と通常`git commit`だけをallowする。bulk staging、amend、`git -c`、削除、
未commit差分の破棄、remote/package管理、PR操作は`permissions.ask`で確認する。GitHub
pluginはread toolを自由に使える状態を保ち、create/update/delete/add/merge/pushなどの
mutation toolだけをaskへ上げる。`gh`のmutation verbとHTTP clientのwrite/uploadも
同じ確認点へ揃える。
PreToolUse hookは危険なcommandをdeterministicに拒否し、credentialらしいwriteと
保護設定の変更を確認へ上げる。file toolのdenyをBashで迂回しないよう、secret pathを
含むshell commandも確認へ上げる。構造化hook decisionはJSONをstdoutへ出してexit 0と
し、exit 2と混在させない。

Claude Code組み込みのcommit / PR workflowは`includeGitInstructions: false`で外す。
PR本文を含むGit workflowはこのrepositoryのruleとskillだけを正本にし、組み込み指示との
競合を作らない。

## Review workflow

通常のcode reviewはdiffに応じた専門reviewerだけを選ぶ。重要なPRではSanity Reviewを
行い、人間が書いたPR本文、AI context、`.dev`、code、testを別々の証拠として読む。
skill frontmatterの`allowed-tools`はtoolを事前承認するだけで、tool集合を制限しない。
Claude Codeがskill用にdocument化していない`disallowed-tools`も強制境界として扱わない。
review/import系skillのcoordinatorは明示的にinspect-onlyとするが、main conversationの
tool集合は通常のpermission境界を保つ。専門reviewerとconsultation subagentはcustom
agentの`tools` allowlistを`Read`、`Grep`、`Glob`へ限定する。live commandの実行と指摘の
再現はmain agentが担い、reviewerへchanged pathとhunkを渡す。

設計前提、security、correctness、trade-offを争う必要がある場合は
[ADR 0001](../adr/0001-herdr-adversarial-review.md)に従ってAdversarial Reviewを行う。
初回は各reviewer最大3件へ絞り、重要な結論が両立する場合はそこで終了する。
一次証拠で解消できないdecision-changingな対立だけを1往復反駁する。reviewer同士を
同じ結論へ収束させることは目的にしない。

Design段階をAdversarial Review、最終段階をAdversarial Reviewを含むSanity Reviewとし、
現行agentに対するChallenger 1体を同じHerdr tabのsibling paneで起動する再設計案は、
[Adversarial ReviewとSanity Reviewの再設計](adversarial-sanity-review.md)に記載する。
この案がAcceptedとなりADRとskillへ実装されるまでは、ADR 0001と現行workflowを使う。

## PRへの出力

- PR本文は人間が書く。AIは本文を生成、補完、書き換え、文案提示しない。
- AI contextは`.dev/contexts/`へ記録し、判断過程をGitで追跡する。
- ユーザーが`publish`を明示した場合だけ、marker付きの`<details>`コメントとして
  日本語でPRへ掲載する。
- Review reportとAI commentも日本語で書き、識別子、command、引用は原文を保つ。
  Review reportは会話内へ返し、PR投稿・編集は別の明示許可がある場合だけ行う。

## データ境界

契約主体は次のとおり。

- 社用account: Claude、GitHub Copilot
- 個人account: OpenCode、Codex、Kimi

自動workflowは、現在利用中の会社承認済みCLIとaccountだけを使う。ただし、社用account
であることは、すべてのrepositoryをそのaccountへ送信できる認可ではない。CLI、account、
対象repositoryの組み合わせが承認済みであることを送信前に確認する。repository内容、
diff、`.dev`、promptを個人accountまたは対象repositoryに未承認のaccountへ送らない。
Claude workflowのAdversarial Reviewとsubagent consultationはClaudeだけを起動する。
GitHub Copilotは社用accountだが別CLIなので、自動fallbackや同一CLI reviewerとしては
使わない。

個人accountを使う場合はworkflow外で会社規程と送信対象を個別に確認する。
Adversarial ReviewやSanity Reviewのfallbackにはしない。このため、Codex、
CodeRabbit、外部rule/skill bundleはglobal skill/pluginとして有効化しない。
Artifactによるclaude.ai page公開と自動connector取得も無効化する。

## Context exportの品質

contextは特定のbranch、変更、PRに紐づく詳細な対話出力と作業証跡である。次の作業者と
Sanity Reviewが判断を再検証できるよう、目的、対象commit、対話で確定した要件、
設計方針、依存する前提、却下案、実施内容、失敗した試行、意図的な非対応、確認済みの
制約、検証証跡、現在地、次のcommit単位TODOを残す。

事実、推論、決定を分離し、証拠のない成功を記録しない。既存contextを更新するときは、
完了、正本化、要約を理由に記録を削減・削除しない。追試で反証した内容も当時の操作と
観測を残し、現在の結論を追記する。context file自体をPRのreview対象として扱う。

context filenameは可読なbranch slugだけに依存させず、full branch refのhashを含めて
一意化する。detached HEADでは自動命名せず、明示的なhandoff名を確認する。

## ContextとMemoryの境界

contextはmemoryではない。current branch、変更、PRの証拠として読むものであり、無関係な
taskへ横断的に読み込まない。複数work itemで利用すべき確認済み知識だけをcontext、ADR、
DesignDoc、research、codeから`.dev/memory/`へ抽出し、根拠へlinkする。memory作成を理由に
contextを要約、移動、削除しない。

memoryは根拠が変われば更新またはsupersedeできる。secret、credential、個人profile、
未確認の推論、PR固有の作業logはmemoryへ置かない。Claude Codeのbuilt-in auto memoryは
無効のままにし、repository memoryをGit review可能に保つ。

## 旧project-local設定の移行

旧`setupdotclaude`がprojectの`.claude/`へコピーしたruleやskillは、global再設計より
強いproject instructionとして残り得る。SessionStart hookは旧fingerprint、旧workflow
rule、旧Codex/context skillを検出した場合に一行警告する。project固有の変更を保護する
ため自動削除せず、人間がdiffを確認して新しいglobal workflowへ移行する。
