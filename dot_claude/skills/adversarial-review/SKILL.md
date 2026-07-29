---
name: adversarial-review
description: >-
  Run a bounded evidence-based adversarial review in a labeled background Herdr tab using
  isolated instances of the same approved CLI. Use a fast first pass and cross-examine only
  unresolved decision-changing claims. Use for consequential designs, risky changes, or when
  sanity-review identifies a material dispute.
argument-hint: "[PR, diff, DesignDoc, ADR, or decision]"
---

# Adversarial Review

Review `$ARGUMENTS` through opposed roles. The purpose is to expose unsupported
assumptions and stronger alternatives, not to manufacture disagreement or settle a vote.

## 1. Build a shared evidence packet

Collect the smallest packet that lets both sides judge the disputed decision: the relevant
human-authored PR body, `.dev` records, changed paths or hunks, focused tests, command output,
and primary sources. Label observed facts, inferences, and decisions. Both sides must receive
the same packet and cite evidence as `file:line`, command output, or URL. Link wider context
instead of asking both reviewers to rediscover the whole repository.

Include the review scope and source locations, but not the main agent's conclusion. Instruct
both reviewers to inspect only: they must not edit files, commit, post comments, or perform
other outward actions.

## 2. Create the Herdr review tab

Load and follow the `herdr` skill. Verify `HERDR_ENV=1`. If the session is not managed by
Herdr, stop and report that Adversarial Review was not performed. Do not replace the
auditable Herdr workflow with subagents or an external AI service.

Read the current agent kind from `herdr agent get "$HERDR_PANE_ID"`. Continue only when it
is Claude, and use Claude for both reviewers. GitHub Copilot is company-managed but is a
different CLI, so do not use it as an automatic fallback. OpenCode, Codex, and Kimi use
personal accounts and must not receive the evidence.

Confirm separately that the active Claude account is authorized for the target repository.
Company ownership of the account does not grant repository-wide authorization. If the CLI,
account, or repository authorization is missing or unclear, stop before creating the tab.

Choose a short Japanese `<scope>` label and a collision-free alphanumeric `<suffix>`. Create
one background tab per review scope. Reuse that tab and its two role contexts for incremental
checks within the same work item; do not recreate the topology for every TODO or Green cycle.
Create a new tab when the decision scope changes or prior discussion would compromise an
independent first pass.

Create the background tab:

```bash
herdr tab create \
  --workspace "$HERDR_WORKSPACE_ID" \
  --cwd "$PWD" \
  --label "敵対レビュー: <scope>" \
  --no-focus
```

Read `<tab-id>` from `.result.tab.tab_id` and `<advocate-pane>` from
`.result.root_pane.pane_id`. Never derive IDs from display order.

Build three columns, then split the coordinator column vertically:

```bash
# Keep the left two-thirds for reviewers; the returned pane is the right coordinator.
herdr pane split <advocate-pane> \
  --direction right --ratio 0.67 --cwd "$PWD" --no-focus

# Divide the reviewer area in half; the returned pane is the challenger.
herdr pane split <advocate-pane> \
  --direction right --ratio 0.5 --cwd "$PWD" --no-focus

# Divide the coordinator area into status and notification panes.
herdr pane split <coordinator-pane> \
  --direction down --ratio 0.5 --cwd "$PWD" --no-focus
```

Read each returned ID from `.result.pane.pane_id`. The original coordinator pane is
`<status-pane>` and the pane returned by the last command is `<notification-pane>`.

Name every surface:

```bash
herdr tab rename <tab-id> "敵対レビュー: <scope>"
herdr pane rename <advocate-pane> "Advocate: <scope>"
herdr pane rename <challenger-pane> "Challenger: <scope>"
herdr pane rename <status-pane> "Status: <scope>"
herdr pane rename <notification-pane> "Completion: <scope>"
```

Choose unique agent names `advocate_<suffix>` and `challenger_<suffix>` after checking
`herdr agent list`. Start both:

```bash
herdr agent start advocate_<suffix> \
  --kind claude --pane <advocate-pane> -- \
  --tools "Read,Grep,Glob" --disallowedTools "mcp__*"
herdr agent start challenger_<suffix> \
  --kind claude --pane <challenger-pane> -- \
  --tools "Read,Grep,Glob" --disallowedTools "mcp__*"
```

`--tools` restricts the built-in tool set; `--disallowedTools "mcp__*"` removes plugin and
MCP escape paths. Do not replace these with `--allowedTools`, which only pre-approves tools.
If either reviewer starts without these restrictions, stop it without sending evidence and
report that the review was not performed.

## 3. Run independent positions

Submit both prompts without `--wait` before waiting for either result so neither reviewer
sees the other's position and both work concurrently.

- **擁護側**: construct the strongest evidence-backed case for the current approach.
  Explain which constraints it satisfies, why rejected alternatives lose, and what would
  falsify the defense.
- **反証側**: seek correctness failures, unsafe assumptions, missing tests, simpler
  alternatives, and cases where the evidence does not support the claimed conclusion.

Both prompts must explicitly prohibit starting another reviewer, invoking
`adversarial-review`, controlling Herdr, or delegating the task. Each reviewer works alone
inside its assigned pane; this prevents recursive review trees. Require at most three
decision-changing findings from each reviewer. Each finding must state the claim, evidence,
decision impact, and the smallest observation that could disprove it. Exclude style comments
and repository-wide archaeology without a concrete failure hypothesis.

After both prompts are submitted, run the completion watcher in the notification pane:

```bash
herdr pane run <notification-pane> \
  "herdr agent wait advocate_<suffix> --until done && \
herdr agent wait challenger_<suffix> --until done && \
herdr notification show '敵対レビュー完了' --sound done"
```

The tab stays in the background, so successful reviewer turns settle as `done`. Do not
focus the tab while waiting. CLI reads do not change `done` to `idle`. The main agent may
continue its own evidence review instead of blocking on `agent wait`.

After the notification, confirm both states with `herdr agent get` and read results with
`recent-unwrapped`. If an agent is `blocked`, inspect it without granting new authority
merely to finish. If the terminal cannot retain a complete result, ask that reviewer to
repeat its existing answer in shorter numbered sections and read each section before
requesting the next. Do not grant `Write` merely to preserve output.

Deduplicate the findings and verify their cited evidence. Stop after the first pass when the
reviewers' material conclusions are compatible, even if they found different issues. Do not
run a rebuttal merely to obtain agreement or another summary.

## 4. Cross-examination

Cross-examine only unresolved, decision-changing claims that remain after the main agent's
initial verification. Give each side only the disputed claim and its cited evidence, not both
complete reports. Allow at most one rebuttal round:

- identify claims that are factually wrong;
- identify evidence interpreted differently;
- state what additional observation would resolve each disagreement;
- withdraw claims that cannot be supported.

Do not continue debating points that have no decision impact.

Skip cross-examination for compatible conclusions, independent findings, style preferences,
or claims already resolved by primary evidence. When it is required, submit both rebuttal
prompts before re-running the same completion watcher in `<notification-pane>`. Since the tab
remains unseen, each completed rebuttal returns to `done`.

## 5. Main-agent verification

The main agent verifies every merge-blocking or decision-changing claim against primary
evidence. A reviewer confidence score is not evidence. Do not resolve a conflict merely
by majority vote or model authority.

The two reviewers use independent contexts but may use the same model. Report this as a
limit on model diversity, not as a failure of reviewer independence. Leave the panes open
so the user can inspect the exchanges; report the tab label, pane labels, agent names, and
states.

## 6. Report

Write the final report in Japanese unless the repository requires another language:

```markdown
## Adversarial Review

### 実行環境と独立性
### 合意できた事実
### 擁護側の主張
### 反証側の主張
### 検証結果
### 未解決の対立点
### 結論
```

Classify conclusions as: immediate action, future consideration, current approach
justified, or insufficient evidence. Preserve code identifiers, commands, and quotations
in their original form.
