# Active work

このdirectoryには未完了のwork itemだけを置く。各fileはcommit単位のchecklistを持ち、
最終itemを完了したcommitで削除する。

管理対象のfileは小文字英数字で始まり、小文字英数字、`.`、`_`、`-`だけを使うtask keyから
`.dev/todo/<task-key>.md`として命名する。`Objective`、`Scope`、`Non-goals`、
`Durable records`、`Commit checklist`を持ち、明示的に認可された`todo-management`
workflowだけがcurrent worktree内で作成、更新、完了する。

`.dev/todo/`はtransientなactive stateであり、durable destinationではない。durable artifactの
canonical areaは`.dev/designdoc/`、`.dev/adr/`、`.dev/research/`、`.dev/contexts/`、
`.dev/memory/`、`.dev/security/`（`coverage.md`と`reports/`）だけである。Prospective `.dev/reviews/<review-key>.md`
は将来のdestinationだが、runtime persistence is unavailableで、既存writer availability gateが
変わるまではshared workflow-state writer rejects `.dev/reviews/`。したがって現時点のcanonical
areaには含めない。

## Persistence obligations

このsectionは任意で、欠落または空でも有効である。statelessなsingle-session workにactive
TODOを強制しない。entryごとにstable lowercase slugの見出しを置き、`Owner`（意味的な
canonical workflow owner）、`Policy`（`required`、`conditional`、`none`）、`State`
（`open`、`closed`）を必須とする。さらに、repository rootからの`.dev/`相対pathである
`Destination`または、空白でない具体的な`No-save reason`のどちらか一方だけを置く。
`todo-management`はmechanicalなTODO lifecycle ownerであり、`Owner`にはしない。

```markdown
## Persistence obligations

### `example-obligation`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `closed`
- Destination: `.dev/contexts/example.md`
- Artifact: [context](../contexts/example.md)
```

`required`はdestination付きでopenに登録し、存在するvalidなdurable artifactへの`Artifact`
linkだけでclosedにできる。`conditional`は条件が適用される場合は同じ lifecycle、適用され
ない場合はconcreteな理由でclosedにでき、`none`はconcreteな理由付きでclosedにする。
通常の状態遷移は`open -> closed`だけである。artifact linkはcurrent worktreeのtaxonomy内
にある既存regular fileへ解決でき、completion時にも有効でなければならない。

obligationの登録・closeとTODOの作成・更新・完了は、policyとは別に、利用者の明示的な
state-write authorizationを要する。resolverはcurrent worktreeの`.dev`だけを使い、別
worktreeやexternal backendを拒否する。mutationはrecord lock、read hashのcompare-and-swap、
同一directory内temporary fileからのatomic replaceを使う。stale/locked recordは再読して
reconcileし、blind retryやlock ageだけのunlockをしない。

登録とcloseは変換前にsection全体をpreflightする。正当なopen obligationはmutationを妨げない。
一方、対象外blockを含むmalformed field、unknown/mismatched owner-policy pair、duplicate ID、
不正path・closure shape・既存evidenceが1つでもあれば、TODOを変更せずに拒否する。

`todo-complete`は既存のchecklist gateと`Durable records` gateを維持し、CAS削除の前に、
obligationの重複ID・不正field・不正policy/state・Destination/No-save reasonの欠落や混在、
open entry、invalidなclosed Artifactを拒否する。sectionがない/空なのは許可する。

完了後も必要な設計判断は`.dev/designdoc/`または`.dev/adr/`へ残す。詳細な対話出力、
実施内容、失敗、検証は`.dev/contexts/`へ記録し、削減しない。複数work itemで再利用する
確認済み知識だけを`.dev/memory/`へ抽出する。完了済みTODOのarchiveはGit historyを使う。
