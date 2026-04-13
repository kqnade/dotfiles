---
name: rev-all
description: Use when user asks to run all reviewers, requests rev-all, wants both CodeRabbit and Codex to review code changes simultaneously.
---

# rev-all: Run All Code Reviewers

Runs both CodeRabbit and Codex in parallel to review code changes, then presents a unified summary.

## When to Use

- User says "rev-all", "run all reviewers", "review with everything"
- User wants comprehensive code review from multiple AI perspectives
- User wants both CodeRabbit and Codex feedback on their changes

## Steps

### 1. Check Prerequisites

```bash
# Check CodeRabbit CLI
coderabbit --version 2>/dev/null

# Check CodeRabbit auth
coderabbit auth status 2>&1

# Check Codex CLI
codex --version 2>/dev/null
```

If either tool is missing or unauthenticated, inform the user of the missing setup before proceeding.

### 2. Run Both Reviewers in Parallel

Launch both reviews simultaneously using the Agent tool or parallel Bash calls:

**CodeRabbit:**
```bash
coderabbit review --plain
```

**Codex** (ask the user for model and reasoning effort if not specified, then run):
```bash
codex exec --skip-git-repo-check --sandbox read-only --full-auto -m gpt-5.3-codex --config model_reasoning_effort="medium" "Review the current git changes. Identify bugs, security issues, code quality problems, and improvement suggestions. Be concise and actionable." 2>/dev/null
```

Default Codex settings for review:
- Model: `gpt-5.3-codex`
- Reasoning effort: `medium`
- Sandbox: `read-only`

### 3. Present Unified Results

Combine findings from both reviewers into a single structured report:

```
## rev-all Summary

### CodeRabbit Findings
[grouped by severity: CRITICAL / HIGH / MEDIUM / LOW]

### Codex Findings
[grouped by severity: CRITICAL / HIGH / MEDIUM / LOW]

### Consensus Issues
[issues flagged by BOTH reviewers — highest priority to fix]

### Action Items
- [ ] <critical issue 1>
- [ ] <critical issue 2>
- [ ] ...
```

Highlight **consensus issues** (flagged by both) as the highest priority.

### 4. Offer to Fix

After presenting the summary, ask the user if they want to fix the identified issues:
- "Would you like me to fix the critical/high issues now?"
- If yes, fix systematically starting from consensus issues, then re-run `rev-all` to verify.
