# AI支援開発workflow

- 状態: 基盤・global rules、active TODO管理workflow運用中
- 更新日: 2026-08-16

## 目的

AIの速度を使いながら、判断過程、実装、テスト、レビューを人間が追跡できる状態に
する。AIの出力自体を根拠にせず、独立した証拠を突き合わせて判断する。

## 正本

開発情報は`.dev/`を正本とする。

- `.dev/todo/`: 未完了作業のcommit単位計画。active stateでありdurable destinationではない。
  最終item完了時に削除する
- `.dev/designdoc/`: 実装前後に更新する設計
- `.dev/adr/`: 重要な選択と却下理由
- `.dev/research/`: 一次資料と調査結果
- `.dev/contexts/`: PR対象となる詳細な対話出力、実施内容、失敗、検証証跡
- `.dev/memory/`: 複数work itemで再利用する確認済みのrepository知識
- `.dev/security/coverage.md`: security coverage ledger
- `.dev/security/reports/`: bounded security areaごとのreport

上記の6領域（`designdoc`、`adr`、`research`、`contexts`、`memory`、`security`）だけを
durable artifactのcanonical taxonomyとする。`security`のcoverage ledgerとreportsは同じ
領域の別artifactであり、必要なら別々のobligationとして登録する。`.dev/todo/`、Gitの
active TODO、会話の出力自体はdurable artifactではない。Prospective
`.dev/reviews/<review-key>.md` はregistry上の将来のdestinationだが、runtime persistence is
unavailableであり、既存writer availability gateが変わるまではshared workflow-state writer
rejects `.dev/reviews/`。したがって現時点のcanonical taxonomyへは追加しない。

obligationの`Destination`は、current Git worktreeのrepository rootから見た
`.dev/`配下のrelative pathでなければならない。絶対path、URL、`..`で外へ出るpath、
別worktreeやexternal backendのrecord、`.dev/todo/`はdestinationとして認めない。閉じた
artifactのlinkもこのtaxonomy内の、current worktreeに存在するregular file（symlinkでは
ないもの）へ解決できなければならない。

## Persistence obligations

active TODOには、必要な場合だけ`## Persistence obligations`を1つ置く。sectionがない、
または見出しだけでentryがない状態は有効であり、statelessなsingle-session workにactive
TODOや空のobligationを強制しない。entryはobligationごとに1つの`###`見出しを置き、見出し
のIDをstable lowercase slug（`[a-z0-9][a-z0-9._-]*`）とする。同一TODO内のIDは一意で、
更新をまたいでも同じ意味の義務には同じIDを使う。

canonical schemaは次のとおりである（例のpathとIDは説明用）。`Destination`と
`No-save reason`は相互排他的であり、各entryには必ずちょうど一方だけを置く。artifactで
閉じるentryは`Destination`を保持し、`Artifact`を追加する。no-saveで閉じるentryには
`Destination`も`Artifact`も置かない。

```markdown
## Persistence obligations

### `security-coverage`
- Owner: `security-audit`
- Policy: `required`
- State: `open`
- Destination: `.dev/security/coverage.md`

### `handoff-context`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `closed`
- Destination: `.dev/contexts/example.md`
- Artifact: [implementation context](../contexts/example.md)

### `stateless-review`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: Current evidence-review contract returns the report in chat and defines no durable review artifact.
```

各fieldの意味とvalidationは次のとおり。

- `Owner`は義務を意味的に発生させたcanonical workflow skill名である。未登録の任意名は
  使わず、policy matrixのcanonical ownerと一致させる。`todo-management`はregistry上
  `required`のmechanical active-state ownerだが、not a semantic durable-artifact obligation
  ownerという明示的な例外であり、obligation entryの`Owner`には使わない。
- `Policy`は`required`、`conditional`、`none`のいずれかである。`required`は常に
  `Destination`付きでopenに登録する。`conditional`は条件が真なら同じくopenに登録し、
  条件が偽ならその判定を具体的に書いた理由でclosedにできる。`none`はdurable artifactを
  要求せず、entryを作る場合は具体的な理由付きでclosedにする。
- `State`は`open`または`closed`だけである。登録時のopen、またはno-save policyのclosed
  が初期状態で、通常の遷移は`open -> closed`だけとする。`required`のopenをno-save
  reasonで閉じることはできない。閉じたentryのinvalidな証拠は完了時に拒否し、暗黙に
  reopenしたり、義務を削除して隠したりしない。修正はrecordを再読して明示的にreconcile
  する。
- `Destination`はnonblankなrepository-root-relative `.dev` pathで、openのentryと
  artifactで閉じるentryに必須である。openでは予定先がまだ存在しなくてもよいが、closed
  では`Artifact`のlink targetが存在し、宣言したdestinationへ対応していなければならない。
- `Artifact`はclosed entryにだけ置くMarkdown linkである。link targetをTODO fileから
  解決し、current worktreeのtaxonomy内にある存在するregular fileへ到達できることを
  完了時に再確認する。外部URL、absolute path、別worktree、symlink、non-regular file、
  `.dev/todo/`へのlinkは無効である。
- `No-save reason`はclosed entryにだけ置く、空白だけでない具体的な説明である。
  `none`ではchat-only/statelessなどの保存不要の根拠を、`conditional`では条件を評価して
  persistenceが適用されなかった事実を明記する。「なし」「N/A」だけの一般的な文言は
  concrete reasonではない。

### Lifecycle and authority

workflowは、保存が必要だと判定した時点で、semantic owner、policy、destinationを含むopen
obligationを登録する。`conditional`が適用されない場合と`none`の場合は、明示的に評価した
concrete reasonを付けたclosed entryとして記録できる。保存不要であればsection自体を作ら
ないことも正当である。policyは保存の必要性を決めるだけで、state writeの権限を与えない。

obligation登録・更新・closeとactive TODOの作成・更新・完了には、常に利用者がそのstate write
を明示的に依頼した、またはworkflowへのstate-write authorizationを明示した、という独立の
認可が必要である。workflowの起動、policy、`Destination`の存在だけから認可を推測しない。
認可がない場合は必要なobligationと理由を会話へ返し、書き込まない。

obligationとTODOはcurrent Git worktreeの`.dev/`だけへ解決する。resolverは別worktree、
`AGENT_WORKFLOW_STATE_HOME`などのexternal backend、手作業で組み立てた別pathへのredirectを
拒否する。別worktreeのrecordやcandidate stateはこのcompletion evidenceにならず、importや
移行が必要なら別の明示的な認可とreconciliationを要する。

registration、close、TODO completionの各mutationは、既存のrecord単位lockを取得し、read時の
`git hash-object --no-filters`をexpected hashとしてcompare-and-swapする。同一directory内の
temporary fileへ完全な内容を書いてからatomic replaceし、他のrecordを巻き込まない。stale
hashや残ったlockを見た場合は最新recordを再読してreconcileする。blind retryやlockのageだけ
を根拠にしたunlockはしない。

registrationとcloseは変換前に既存の`Persistence obligations` section全体を同じcanonical
schemaでpreflightする。mutation中は正当なopen obligationを許可するが、対象外blockを含む
malformed field、unknownまたはmismatchedなowner-policy pair、duplicate ID、不正path・closure
shape、存在しないまたは不正なclosed evidenceが1つでもあればwrite前に拒否し、TODOのbytesを
変更しない。その後もrecord lockとexpected hashによるCASがpreflight後の競合を防ぐ。

### Skill policy matrix

policyは`using-workflow-skills`のcanonical persistence policy registryを正本として、ここへ
同じ内容を反映する。「そのskillがこのwork itemで発生させるworkflow-state persistence」の
既定値であり、上記のstate-write authorizationとは別である。複数artifactが必要なskillは
artifactごとに一つのobligationを登録する。`todo-management`だけはactive TODOを機械的に
保存するため`required`だが、semantic durable-artifact obligationの対象から除外する。

| Canonical skill | Policy | Default destination, condition, or concrete rationale |
| --- | --- | --- |
| `route-large-implementation` | `none` | dispatch/topologyの制御であり、意味的な成果物は実行側ownerが持つ。 |
| `execute-worktree-implementation` | `none` | worktree execution自体は独自のworkflow-state writeを要求しない。必要なartifactは適用された別のsemantic ownerが持つ。 |
| `test-driven-development` | `none` | Red/Green evidenceは実装と検証へ反映し、TDD自体は独自のworkflow-state writeを要求しない。 |
| `evidence-review` | `none` | Prospective `.dev/reviews/<review-key>.md` は将来のdestinationだが、runtime persistence is unavailableで、shared workflow-state writer rejects `.dev/reviews/`。現行contractはreportをchatへ返す。 |
| `context-handoff` | `conditional` | `export`は `.dev/contexts/<task>.md` へ保存する。read/importだけならwrite obligationを作らず、書かなかった具体的な理由を使える。 |
| `security-audit` | `required` | 毎回 `.dev/security/coverage.md` と `.dev/security/reports/<area-key>.md` を更新する。各fileを別obligationとして登録する。 |
| `todo-management` | `required` | active TODOのmechanical active-state owner。not a semantic durable-artifact obligation ownerであるため、obligation entryのownerにはしない。 |
| `prose-proofreading` | `none` | 指定された文書やdiffへの修正が成果であり、別のdurable artifactを作らない。 |
| `assumption-pruning` | `none` | 比較結果は呼び出し元へ返し、別のworkflow-state writeを要求しない。 |
| `peer-consultation` | `none` | 独立したchallengeの結果は呼び出し元へ返し、決定の保存は呼び出し元workflowが担当する。 |
| `herdr` | `none` | session/pane orchestrationだけを行い、各実行のsemantic artifactを所有しない。 |

`security-audit`のreportがcoverage ledgerを参照する場合でも、reportを先に保存し、ledgerを
最後に更新する既存のmonotonic publish orderを守る。obligationのcloseはlink先が存在してから
行う。閉じた後にlink先が消えたり差し替えられたりした場合、completion時の再検証で失敗にする。

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

## Active TODO管理

`todo-management`を`.dev/todo/`のactive work item lifecycleに対する唯一のcanonical
ownerとする。TDDは実行可能な振る舞いの変更、context handoffはsession間の引き継ぎを
引き続き所有し、TODO管理へ責務を重複させない。

TODOの作成、更新、完了は、利用者がそのstate writeを明示的に依頼した場合だけ行う。
別のworkflowがTODOを必要と判断しただけでは書き込みを認可せず、未認可の場合は必要性と
対象を会話で提示する。管理対象はcurrent Git worktreeの`.dev/todo/`だけとし、別worktreeや
`AGENT_WORKFLOW_STATE_HOME`へredirectしない。

task keyは小文字英数字で始まり、小文字英数字、`.`、`_`、`-`だけを使用する安定した名前と
する。fileは`.dev/todo/<task-key>.md`とし、最低限次のsectionを持つ。

- `Objective`: 完了時に成立する状態
- `Scope`: このwork itemが扱う範囲
- `Non-goals`: 意図的に扱わない範囲
- `Durable records`: 完了前に残すDesignDoc、ADR、research、context、memoryへのlink、
  または保存不要と判断した具体的な理由
- `Commit checklist`: 一つずつ独立してreview、検証、revertできるGreen increment

active TODOはdurable recordではないため、contextやsecurity recordのidentity blockを要求しない。
作成と更新はrecord単位のlock、read時のhashを用いたcompare-and-swap、同一directory内の
temporary fileからのatomic replaceを使う。競合時は最新内容を再読して調整し、blind retryや
lockのageだけを根拠にした解除を行わない。

完了操作は、すべてのcommit checklistが完了し、`Durable records`の各link先がcurrent
worktreeの`.dev/`内に存在すること、または保存不要の具体的理由があることを確認してから、
read時のhashと一致するfileだけを削除する。判断と詳細な作業証跡を先にdurable recordへ保存し、
完了済みTODOのarchiveは作らずGit historyを使用する。

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

Claudeのglobal rulesは2026-08-04にblank-slate resetした後、具体的な利用例から
`coding.md`、`verification.md`、`operations.md`、`git.md`、`delivery.md`の5責務だけを
再構築した。常時守る短い不変条件だけをruleに置き、TDD、review、handoffなどの複数stepを
持つ手順はcanonical skillへ委譲する。

旧Adversarial ReviewとSanity Reviewは実行せず、欠如をfallbackで補わない。review専用の
global rule、custom agent、workflow skillは引き続き配置しない。通常のreviewは現在のagentが
code、test、command output、一次資料を直接確認する。

後継workflowは、具体的な利用例、trigger、必要な出力、許容する外部送信と権限境界を先に
確定し、一つの責務ごとに最小のruleまたはskillとして新規設計する。旧skill名、agent構成、
Herdr topologyを互換性のために復元しない。[ADR 0001](../adr/0001-herdr-adversarial-review.md)
と[旧再設計案](adversarial-sanity-review.md)はSupersededの履歴資料としてのみ参照する。

## PRへの出力

- PR本文は人間が書く。AIは本文を生成、補完、書き換え、文案提示しない。
- AI contextは`.dev/contexts/`へ記録し、判断過程をGitで追跡する。
- AI contextを外部へ投稿するworkflowは現在提供しない。
- Review reportとAI commentも日本語で書き、識別子、command、引用は原文を保つ。
  Review reportは会話内へ返し、PR投稿・編集は別の明示許可がある場合だけ行う。

## データ境界

契約主体は次のとおり。

- 社用account: Claude、GitHub Copilot
- 個人account: OpenCode、Codex、Kimi

ClaudeはGitHub remote ownerが`livesense-inc`または`jobtalk`のrepositoryだけで使う。
shell wrapperがbinary起動前にremoteを確認し、`UserPromptSubmit`と`PreToolUse`のglobal
hookもprompt処理前とtool実行前に確認する。それ以外、originなし、Git worktree外はexit 2で
拒否する。許可repositoryでは個人accountのOpenCode、Codex、Kimi、Lunaへrepository内容、
diff、`.dev`、promptを送らない。逆に許可owner以外のrepositoryではClaudeを使わず、
承認済みの個人clientを使う。

Codexのglobal `AGENTS.md`はcanonicalな`~/.agents/rules/git.md`へのsymlinkとする。このruleは
Claude専用namespaceで停止し、それ以外の承認済みrepositoryではGreenなincrementだけを
stageして`git cc`でcommitする。Claude側は`git cc`を起動せず、同じmessage formatを現在の
Claude sessionで生成して`git commit -m`を使う。

社用accountであることは、すべてのrepositoryをそのaccountへ送信できる認可ではない。
CLI、account、対象repositoryの組み合わせが承認済みであることを送信前に確認する。
Claudeの別sessionやsubagentは、利用者が大規模実装workflowを明示的に起動した場合だけ、
同じ承認済みClaude accountと同じ認可repository、そのlinked worktreeに限定して使う。
scopeが大きいというmodel判断だけではClaude workflowを自動起動しない。accountやcredentialの
選択を上書きせず、各worktreeでもrepository認可hookを通す。個人accountを使う場合はworkflow外で
会社規程と送信対象を個別に確認する。Codex、CodeRabbit、外部rule/skill bundleはglobal
skill/pluginとして有効化しない。
Artifactによるclaude.ai page公開と自動connector取得も無効化する。

## Context記録の品質

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
