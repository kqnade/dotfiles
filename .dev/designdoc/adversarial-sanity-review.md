# Adversarial ReviewとSanity Reviewの再設計

- 状態: Superseded
- 更新日: 2026-08-04
- 対象: Claude Code global review workflow
- 関連ADR: [ADR 0001](../adr/0001-herdr-adversarial-review.md)

## 目的

> 2026-08-04にClaude global workflow層を一度撤去する方針へ変更したため、本案は
> 実装せずSupersededとした。後継設計は具体的な利用例から新規に作成する。

AIが作成した設計と実装を、そのAI自身の説明だけで正当化しないreview workflowを作る。
実装前は設計の必要性と過剰さをAdversarial Reviewで争い、実装後は新しいAdversarial
Reviewを含むSanity Reviewで、設計から最終成果物までの整合性を検証する。

reviewを増やすこと自体は目的にしない。通常経路はDesign段階と最終段階の二つに限定し、
各commitをAI reviewerへ送る中間reviewや、現行agentと同じ立場を再現するAdvocate agentは
設けない。

## 現状と変更理由

現行の[ADR 0001](../adr/0001-herdr-adversarial-review.md)と
`adversarial-review` skillは、Herdrの専用background tabへAdvocateとChallengerを
1体ずつ起動する。`sanity-review`は、materialな対立が見つかった場合だけ
Adversarial Reviewを呼び出す。

この構成には次の重複と遅延がある。

- 現行agentがすでに採用案と根拠を持つため、別のAdvocateが同じ立場を再構成する。
- Design段階で必要性と過剰さを争わない場合、実装後まで根本的な反証が遅れる。
- Challengerが1体だけなら、専用tabとtab内のpane分割は不要である。
- 最終Sanity ReviewでAdversarial Reviewが任意だと、設計時には見えなかった実装上の
  反証を得ないまま最終判断する場合がある。

本DesignDocがAcceptedになるまでは、ADR 0001と現行skillを実装上の正本とする。
実装時にADR 0001をsupersedeまたは改訂し、文書とruntimeの不一致を残さない。

## 設計原則

### 現行agentを一方の当事者にする

現行agentは、要求を解釈し、設計を作成し、実装する主体である。このagentを現在案の
当事者として扱い、追加agentはChallengerだけを起動する。

現行agentの主張も権威にはしない。問題、制約、採用案、前提、却下案、検証方法を
DesignDoc、ADR、research、context、code、testなどのreview可能な証拠として提示する。

### Challengerは反証を担当する

Challengerは現在案への同意案を作らず、次を探す。

- 変更しない方がよい根拠
- 問題を満たす、より小さい変更
- 過剰な抽象化、機構、scope
- 成立していない前提と反例
- 却下案の不公平な比較
- 設計と実装、test、記録の矛盾
- 判断を変えるために不足している証拠

初回回答は最大3件のdecision-changingな指摘へ限定する。各指摘は、主張、証拠、
判断への影響、反証に必要な最小の観測を含める。style上の好みや、具体的なfailure
hypothesisがないrepository全体の探索は対象外とする。

### Sanity Reviewを最終裁定にする

Adversarial Reviewは対立する仮説を作る手段であり、結論を多数決で決める工程ではない。
Sanity Reviewが人間作成のPR本文、AI context、`.dev`、commit、diff、test、CI、
Design段階と最終段階のChallenger出力を独立した証拠として照合する。

現行agentとChallengerの一致は証拠にならない。mergeを妨げる主張と判断を変える主張は、
main coordinatorがcode、test、command output、一次資料で検証する。

## Workflow

### 1. Design Adversarial Review

実装へ進む前に、現在案の必要性と過剰さをreviewする。

1. 現行agentが問題、期待結果、scope、non-goal、制約、採用案、代替案、前提、
   検証計画をDesignDoc、ADR、research、TODOへ記録する。
2. `conversation-context-export`で、設計に至った詳細な対話出力、判断材料、却下案、
   未解決事項を`.dev/contexts/`へ記録する。
3. 現在のHerdr tabにChallenger用sibling paneを一つ作り、会社承認済みの同一CLIを
   独立contextで起動する。
4. Challengerへ現在案と証拠の所在を渡し、変更の必要性、より小さい案、過剰設計、
   誤った前提を反証させる。
5. 現行agentが各指摘を一次証拠で確認する。解消できないdecision-changingな対立だけ、
   claimと証拠を限定して一往復反論する。
6. Challengerの出力、現行agentの検証、採用・棄却・未解決の判断をcontextへ追記する。
   durableな設計判断はDesignDocまたはADRへ反映する。
7. 記録を取得した後、workflowが作成したChallenger paneを閉じて通常layoutへ戻す。

Designが大きく変わり、最初のChallengerがreviewした前提やdecision scopeが成立しなく
なった場合は、新しいcontextのChallengerでDesign Adversarial Reviewをやり直す。
各commitや通常のRed / Green cycleでは実行しない。

### 2. TDDとcommit

Design Adversarial Reviewで現在案を採用した後、`.dev/todo/`のcommit単位itemを
Red / Green TDDで実装する。test不能な変更は理由と代替検証をTODOへ記録する。

各itemのGreen、commit、通常のcode reviewをAdversarial Reviewの代わりにしない。
一方、各commitをChallengerへ逐次送信しない。前提を覆す失敗やscope変更はcontextへ
記録し、Designを変更する場合だけDesign Adversarial Reviewをやり直す。

### 3. Sanity Review

最終成果物をreviewできる状態で、Adversarial Reviewを内包するSanity Reviewを行う。

1. `conversation-context-export`で対象commit、実施内容、失敗、検証、意図的な非対応、
   Design Adversarial Reviewの結果を最新化する。
2. Sanity coordinatorが、人間作成のPR本文、AI context、関連するDesignDoc、ADR、
   research、commit、diff、test、CIを別々の証拠として収集し、claimとevidenceを対応
   付ける。
3. Design段階のChallengerを再利用せず、現在のHerdr tabの新しいsibling paneへ
   最終成果物用のChallengerを起動する。
4. Challengerは、設計と実装のずれ、correctness、security、silent failure、
   test不足、scope逸脱、証拠の矛盾、より小さい最終案を反証する。
5. Sanity coordinatorが指摘を一次証拠で検証し、必要な場合だけ一往復反論する。
6. merge blocker、判断不能にする証拠不足、non-blockingな将来事項、未解決の対立、
   skipped checkを区別した日本語reportを会話へ返す。
7. Challenger出力と検証結果をcontextへ追記した後、workflowが作成したpaneを閉じる。

Sanity Reviewを実行する実質的な変更では、最終Adversarial Reviewを任意工程にしない。
単純なtypoなどSanity Review自体を必要としない変更の閾値は、Skill実装前にruleと
trigger descriptionで明文化する。

## Herdr topology

Challengerは専用workspaceや専用tabではなく、現行agentと同じtabのsibling paneで
起動する。

```text
Current tab
├── Main: 現行agent
└── Challenger: <scope>
```

現行paneのlayoutを確認し、wideなら右、narrowまたはtallなら下へ分割する。固定ratioを
前提にせず、現行agentの操作領域を損なわない大きさにする。focusとcwdを維持する。

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
herdr pane split --current \
  --direction <right|down> --cwd "$PWD" --no-focus
herdr pane rename <challenger-pane-id> "Challenger: <scope>"
```

作成responseの`.result.pane.pane_id`を使い、paneの表示順からIDを推測しない。
agent nameはlive agentと衝突しない`challenger_<suffix>`とする。

Claudeを起動する場合はbuilt-in toolを`Read`、`Grep`、`Glob`へ限定し、MCP toolを除外する。
Challengerはfile変更、command実行、commit、外部投稿、Herdr操作、追加agent起動を行わない。

同じtabは既に表示済みなので、完了後のagent stateは`done`ではなく`idle`になる場合がある。
`idle`と`done`をsettledとして扱う。通常経路では`agent wait`をpollingせず、role labelを
検出するClaude `Stop` / `StopFailure` hookからHerdr通知を直接送る。通知は人間へ届くが、
main agentを自動再開しない。

閉じる対象はworkflow自身が作成し、出力をcontextへ取得済みのChallenger paneだけとする。
既存pane、tab、workspaceを閉じない。

## 証拠と記録

### `.dev/contexts/`

contextはSanity Reviewへ渡すPR単位の詳細な対話出力と作業証跡である。次を削減せず残す。

- 現行agentが提示した現在案と根拠
- Designと最終成果物に対するChallengerの出力
- 反論と、対立を解消した一次証拠
- 採用、棄却、未解決の判断
- 失敗した試行、前提変更、意図的な非対応
- 対象commitと検証結果

DesignDocやADRへ判断を正本化しても、contextの対話出力と作業証跡を要約、移動、削除
しない。複数work itemで再利用する確認済み知識だけを`.dev/memory/`へ別途抽出する。

### DesignDoc、ADR、research

- DesignDoc: 現在の設計、interface、制約、検証計画
- ADR: 採用したdurableな判断、代替案、結果
- research: 一次資料、実験、未解決の事実

Challengerの発言自体を正本として扱わない。reviewによって確認した事実と採用判断だけを、
根拠へlinkして適切な正本へ反映する。

## Accountとpublicationの境界

ClaudeとGitHub Copilotは社用account、OpenCode、Codex、Kimiは個人accountである。
このworkflowは、対象repositoryで利用を承認されたClaude CLIとaccountの組み合わせだけを
自動起動する。社用accountであることだけではrepositoryへの送信許可にならない。

このdotfiles repositoryは社用Claudeの利用対象ではないため、ここでClaude Challengerを
起動してrepository内容を渡さない。Skill実装後のlive forward testは、Claudeと対象
repositoryの組み合わせが会社承認済みの環境で行う。このrepositoryではstatic validation、
fixture、Herdrのrepository非依存なcontrol surfaceの確認だけを行う。

PR本文は人間が作成する。AIはPR本文を生成、補完、書き換え、文案提示しない。
Sanity Review reportとPR向けAI commentは日本語で作成するが、PRへの投稿・編集は別の
明示許可がある場合だけ行う。AI contextを公開する場合は、`conversation-context-export
publish`のmarker付き`<details>` commentを使い、PR本文へ入れない。

## Failure handling

- Herdr外ではAdversarial Reviewを未実施として報告し、自動fallbackしない。
- CLI、account、repository authorizationのいずれかが不明なら、証拠を送信する前に停止する。
- Challengerが`blocked`なら内容を確認し、review完了のためだけに権限を拡張しない。
- `unknown` stateを完了とみなさない。
- terminalから回答を取得できない場合は、既存回答を短い番号付きsectionで再表示させる。
  回答保存のために`Write`を追加しない。
- Challengerを実行できなかったSanity Reviewは、Adversarial Review未実施と制約を明記し、
  完全なreviewとして扱わない。

## 実装対象

このDesignDocの承認後、次をcommit単位に実装する。

1. ADR 0001を本設計に合わせてsupersedeまたは改訂する。
2. `adversarial-review`を「現行agent対Challenger 1体」とsibling pane topologyへ変更する。
3. `sanity-review`へ最終Adversarial Reviewを標準工程として組み込む。
4. `review.md`、`ai-assisted-development.md`、context templateを新しい責務へ揃える。
5. Herdr notification hookとfixtureから不要なAdvocate前提を除き、Challengerだけを通知する。
6. repository validatorで、tab作成、Advocate起動、2 reviewer待機が再導入されないことを
   検証する。
7. chezmoi runtimeへ適用し、sourceとruntimeのdriftがないことを確認する。

実装commitにこのDesignDoc作成commitを混ぜない。各behavior変更は期待するRedを確認して
から最小実装を行い、Green後にcommitする。

## Acceptance criteria

- Designの必要性と過剰さが実装前にChallengerから反証される。
- 現行agentと同じ立場のAdvocate agentを追加起動しない。
- Challengerは現在tabのsibling paneへ1体だけ起動される。
- Design段階と最終Sanity Reviewでは独立したChallenger contextを使う。
- Sanity Reviewが最終Adversarial Reviewを含み、両段階の対立記録を検証する。
- reviewerへrepository変更または外部write権限を与えない。
- Context Exportが両段階の対話出力と証拠を削減せずGit追跡する。
- notification待機用paneとpolling loopを作らない。
- PR本文をAIが生成せず、外部投稿は明示許可を要求する。
- 未承認のaccountまたはrepositoryへ証拠を送信しない。

## 未決定事項

- Design Adversarial Reviewを必須にする変更規模と、skip理由を記録する場所。
- Sanity Review自体を必須にする変更規模。
- 同じtabの幅がsibling paneに不十分な場合、reviewを停止するか、ユーザーへ専用tabの
  明示選択を求めるか。
