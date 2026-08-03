# ADR 0001: Herdr上の同一CLIでAdversarial Reviewを行う

- 状態: Superseded
- 決定日: 2026-07-29
- 更新日: 2026-08-04

> 2026-08-04にClaude global workflow層を一度撤去したため、本決定は現在のruntimeへ
> 適用しない。履歴とforward testの証拠として保持し、後継ADRは新しいworkflowを採用する
> 時点で作成する。

## コンテキスト

ClaudeとGitHub Copilotは社用account、OpenCode、Codex、Kimiは個人accountである。
会社のcode、diff、`.dev`記録を個人accountへ自動送信せずに、実装者側の説明へ
引っ張られない対立レビューと、人間が追跡できるレビュー過程が必要である。

## 決定

Claude workflowのAdversarial ReviewはHerdrのbackground専用tabにClaudeを独立起動して
行う。GitHub Copilotは社用accountだが同一CLIではないため、自動fallbackにはしない。
tabは擁護側と反証側の2 paneへ等分する。

- 擁護側と反証側へ同じ証拠packetを渡す。
- 最初の見解は互いに見せず、並列に作成する。
- 初回は各reviewer最大3件のdecision-changing findingへ絞る。
- tabと全paneに対象と役割が分かるlabelを付ける。
- background tabをfocusせず、各reviewerの`Stop` / `StopFailure` hookからHerdr通知を
  直接出す。
- coordinator側に完了待機paneを作らず、`herdr agent wait`でpollingしない。
- 両者の重要な結論が両立する場合は初回で終了する。
- 一次証拠で解消できないdecision-changingな対立だけ、反論を1往復行う。
- main agentがmerge判断を変える主張を一次証拠で検証する。
- paneは自動で閉じず、人間が対話を監査できる状態で残す。
- reviewerからの再帰的なagent起動とHerdr操作を禁止する。
- Herdrから起動するClaudeは`--tools "Read,Grep,Glob"`でbuilt-in toolを限定し、
  `--disallowedTools "mcp__*"`でMCP toolを除外する。
- 社用Claude accountであることに加え、そのaccountが対象repositoryへ利用許可されて
  いることを証拠packetの送信前に確認する。
- Herdrを利用できない場合はAdversarial Reviewを未実施として報告し、別方式へ
  自動fallbackしない。

OpenCode、Codex、KimiはClaudeのglobal skillと自動workflowから外す。個人accountを
使う場合は、このworkflow外で会社規程と送信対象を個別に確認する。

## 結果

### 利点

- 会社codeを会社承認済み環境内に保てる。
- roleとconversation contextを分離し、確認biasを減らせる。
- Herdr paneに検討過程が残り、人間がside-by-sideで確認できる。

### 制約

- 同一modelを使うため、model多様性は得られない。
- 同じ誤学習や盲点を共有する可能性があり、合意は独立した証拠にならない。
- Claude sessionを2つ追加するため、時間とtoken消費が増える。
- 最終判断にはmain agentによる一次証拠の検証が必要である。
- 同じwork itemの増分reviewではtabとrole contextを再利用するため、完全に新規の
  contextによる評価ではない。decision scopeが変わる場合は新しいtabを作る。
- read-only reviewerはfileへ回答を書き出せない。terminal保持量を超える場合は、既存回答を
  短い番号付きsectionへ分けて再表示させる。
- Herdr通知は人間への通知であり、main agentを自動再開しない。main agentは通知後に
  各reviewerの状態を1回確認し、未完了ならpollingせず次の通知を待つ。

## 却下した案

### 個人accountのAIとClaudeを自動で対立させる

model多様性は得られるが、会社情報を個人アカウントへ送る危険があるため不採用。

### main agentが一人で両方の役を演じる

追加環境は不要だが、推論contextが分離されず、対立の独立性と監査性が弱いため
標準手順にはしない。

## Forward testで確認したこと

2026-07-29に、このdotfiles再設計を対象として同一Codex CLIを2paneへ起動し、
独立reviewと1往復のcross-examinationを実行した。このforward testは個人環境の
dotfilesを対象とした手順検証であり、会社repositoryの標準CLIをCodexにする決定ではない。

- 同一CLIでも独立contextから異なる指摘が得られた。
- 同じ表示中tabでは完了状態が`idle`になり、`agent wait`が一時状態で返る場合があった。
- prompt内の完了markerはTUIの折り返しで誤検出し得る。
- 長い最終回答がterminalのalternate screenから失われる場合があった。試験時は一時
  Markdown fileへ再出力したが、read-only制約を強制した標準workflowでは採用しない。

この結果から、background専用tab、役割label、短いsection単位の再表示を標準化した。
その後、完了待機paneによる`done`待機は、役割labelを判別するClaude `Stop` /
`StopFailure` hookからの直接通知へ置き換えた。fixtureによる対象paneの絞り込みと、
Herdr sessionへの実通知を確認した。
