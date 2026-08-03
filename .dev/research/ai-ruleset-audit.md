# AI ruleset監査

- 調査日: 2026-08-03
- 状態: 変更候補の合意待ち
- 対象: Claude Code、OpenCode、Codex、Kimiのglobal instructions、rules、skills、
  agents、hooks、permissions

## 問い

AI voice削除後のglobal設定は、必要な指示だけを適切なclientと実行境界へ置き、重複や
矛盾なく運用できるか。

## 一次資料

- [Claude Code: How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Claude Code: Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code: Configure permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code: Hooks reference](https://code.claude.com/docs/en/hooks)
- [OpenCode: Rules](https://opencode.ai/docs/rules/)
- [OpenCode: Permissions](https://opencode.ai/docs/permissions/)
- [OpenCode: Config](https://opencode.ai/docs/config/)

## 確認した現状

### Claudeの常時ruleは小さい

`dot_claude/rules/`は`coding.md`、`development.md`、`review.md`の3 file、計55行である。
いずれも`paths` frontmatterを持たないため、Claudeではuser-level ruleとして全sessionへ
常時読み込まれる。Claude公式仕様ではuser-level ruleの後にproject ruleが読み込まれ、
project固有指示が高い優先度を持つ。

現状のサイズだけを理由に3 fileを統合または削除する必要はない。`development.md`と各skillに
意図的な反復はあるが、常時適用するrecord / control boundaryと、必要時に読むworkflow手順の
分離として説明できる。

### OpenCodeがproject AGENTS.mdを重ねて指定している

OpenCodeはproject rootの`AGENTS.md`を標準で読む。さらに現在の`instructions`には
`AGENTS.md`が明示されており、公式仕様上はcustom instructionと標準`AGENTS.md`が結合される。
同一fileをdeduplicateする保証は一次資料で確認できないため、`instructions`から
`AGENTS.md`を外すべきである。`.cursor/rules/*.md`は標準探索対象ではないため維持できる。

### Claude rules bridgeがclient固有ruleをOpenCodeへ常時投入する

`dot_config/opencode/plugins/claude-rules.ts`はglobalとprojectの`.claude/rules/*.md`を
OpenCodeのsystem promptへ追加する。現在の3 ruleはすべてalways-onなので、176行のpluginが
実装するpath activationは使われていない。

このbridgeにより、Claude / Herdr skill、Claude account、GitHub pluginを前提にした
`development.md`と`review.md`まで個人accountのOpenCodeへ入る。共通化したいcoding方針と
Claude固有workflowの境界がない。plugin自体にもtestがなく、
`experimental.chat.system.transform`へ依存している。

### OpenCodeのpermissionがClaude側のcontrol boundaryからdriftしている

OpenCode permissionは最後に一致したpatternが勝つ。現在は`"git *": "allow"`の後に
force pushだけをdenyしているため、通常の`git push`、`git reset`、`git clean`、
`git restore`などは確認なしで実行できる。

この設定はCommit `3ff7146`で当時のClaude permissionをmirrorした後、Claude側を
Commit `825bd8b`でpath指定のadd / 通常commitだけallowする構成へ変更した際に追従して
いない。現在の`development.md`が要求するremote write、履歴破壊、差分破棄の確認点とも
矛盾する。

### mise pinとOpenCode self-updateが競合する

OpenCodeは`mise.toml`と`mise.lock`でversionを固定しているが、global configは
`"autoupdate": true`である。OpenCode公式設定は`false`または`"notify"`を選べる。
miseを正本にするためself-updateは`false`にすべきである。

### Skillとagentに整理候補がある

- `catchup`と`conversation-context-import`は、branch hashからcontextを解決し、TODO、
  linked records、Git stateを読んで作業文脈を復元する同じ責務を持つ。
  exportとの対称性と詳細なstaleness確認を持つ`conversation-context-import`を残せる。
- `code-reviewer`などのdescriptionは「any code change」「every PR review」など単独での
  proactive起動を促す。一方、`pr-review`はdiffに必要なreviewerだけを選ぶと定めるため、
  reviewer descriptionをcoordinatorから選択された場合だけに限定する必要がある。
- `frontend-designer`はreviewerではなく、`Write`、`Edit`、`Bash`を持つ実装agentである。
  現行workflowから参照されず、自動起動条件も広い。利用実績がなければ削除し、必要なら
  明示起動するskillとして別途設計する方が安全である。
- `executable_auto-test.sh`はsettingsから参照されず、repository内にも呼出元がない。
  未配線の148行を残す理由はない。

### Review再設計は別の合意単位である

`adversarial-sanity-review.md`は`Proposed`であり、現行skillと矛盾する。ruleset cleanupへ
混ぜず、変更規模のthresholdと狭いtabでのfailure handlingを決め、DesignDocをAcceptedに
してからADR、skill、hook、validatorをまとめて変更する必要がある。

## 推奨する構成

### 1. 低riskなdriftと重複を先に直す

1. OpenCode `instructions`から`AGENTS.md`を削除する。
2. OpenCode `autoupdate`を`false`にする。
3. OpenCode permissionをClaudeと同じcontrol boundaryへ揃える。
4. 未配線の`auto-test` hookを削除する。
5. `catchup`を削除し、`conversation-context-import`へ一本化する。
6. reviewer agentのdescriptionをcoordinator選択時だけ起動する表現へ直す。
7. `frontend-designer`を削除する。継続利用する明確な用途がある場合だけ別itemで残す。

### 2. Claude rules bridgeを削除する

推奨はClaude-centric構成である。

- Claudeの3 rulesと`.dev` workflow skillsはClaudeだけへ配備する。
- OpenCode、Codex、Kimiは各repositoryの`AGENTS.md`を正本にする。
- OpenCodeの`claude-rules.ts`は削除する。
- 将来client共通の指示が必要になった場合は、Claude固有ruleをmirrorせず、中立な共通fileと
  各clientの標準読込機構を明示的に設計する。

これにより、個人accountのclientへClaude / Herdr / 会社account前提のworkflowを自動投入
せず、project instructionはrepositoryでreviewできる。

### 3. Review workflowはDesignDoc合意後に実装する

cleanup完了後、Adversarial / Sanity Review再設計を独立したcommit列として進める。
Design Adversarial Reviewは、durableな選択肢、trust / data boundary、不可逆migration、
security / correctness上の高riskがある変更を対象にする。単純なtypo、pin更新、既存patternに
沿う局所修正はskip理由をTODOまたはcontextへ一行残せばよい。

Sanity Reviewはproduction behavior、public interface、security、data migration、
deployment / runtime、複数commitにまたがる設計変更を対象にする。dependency-only PRは
`library-update-review`へ分ける。同じtabを安全に分割できない場合は未実施として停止し、
暗黙に専用tabへfallbackしない。

## 採用しない案

- 3つのClaude ruleを1 fileへ統合する: 読込量は変わらず、責務の境界だけが失われる。
- Claude固有workflowをCodex / Kimi用global `AGENTS.md`へ複製する: client能力、account、
  permission境界が異なり、同じ文面でも同じbehaviorを保証しない。
- cleanupとProposed review再設計を一括実装する: drift修正とworkflow変更を独立してreview、
  revertできなくなる。

## 未確認事項

- `frontend-designer`を現在も明示的に利用しているか。
- Claude-centric構成を採用し、OpenCodeからClaude rules bridgeを削除してよいか。
- `language: Friendly Japanese`を会話言語指定として残すか、`Japanese`へ変えるか。
