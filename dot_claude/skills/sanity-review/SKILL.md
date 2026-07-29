---
name: sanity-review
description: >-
  Perform a deep pull request review that treats the human-authored PR body, AI context,
  `.dev` records, implementation, and tests as independent evidence. Challenges the
  decision process as well as the resulting code.
argument-hint: "[PR URL or number]"
---

# Sanity Review

Review a feature, bug-fix, or refactoring pull request. Route dependency-only updates to
`library-update-review`.

The purpose is not to validate the implementation's own story. It is to independently
test whether the stated problem, decision process, implementation, and evidence agree.
The coordinator remains inspect-only; all delegated reviewers must use custom agents whose
`tools` allowlist excludes mutation, shell, MCP, Skill, and Agent tools.

## 1. Collect independent evidence

Fetch the PR metadata, human-authored body, author comments and reviews, diff, commits, and
checks. Read the PR body before the diff so the implementation cannot retroactively make
an incomplete explanation appear sufficient.

Evaluate the body without rewriting it:

- Does it explain the prior state or problem?
- Does it state the intended outcome and scope?
- Does it explain why the change is appropriate?
- Does it describe verification?
- Does it show enough understanding for a reviewer to judge the change?

Never draft, complete, rewrite, or suggest copy-ready PR body text.

Read AI context separately from a comment marked
`<!-- ai-conversation-context:<context-id> -->` or `.dev/contexts/`. Read the relevant
active `.dev/todo/` work items, when present, and follow linked DesignDocs, ADRs, and
research. A completed change should have no retained TODO file. Keep human claims and
AI-generated context distinguishable throughout the report.

## 2. Build an evidence map

Map each important claim to its source and verification:

- problem and intended behavior;
- accepted design and assumptions;
- rejected alternatives;
- failed experiments and observations;
- intentionally excluded scope;
- TODO-to-commit correspondence;
- tests and other verification.

Call out missing evidence, stale `.dev` state, and contradictions rather than filling gaps
with plausible explanations.

## 3. Challenge the process

Review:

1. Whether the implementation matches the PR body and canonical `.dev` records.
2. Whether naming and structure match comparable existing code.
3. Whether rejected alternatives were compared fairly.
4. Whether failed attempts actually disproved the approach or only used a flawed test.
5. Whether excluded work remains safe to exclude after seeing the implementation.
6. Whether each key assumption can be removed to produce a simpler solution.

Classify alternative conclusions as: act now, future consideration, or current design
justified. Do not invent requirements unsupported by the PR, `.dev`, code, or product facts.

## 4. Review the code and tests

Use `pr-review` to select read-only specialists for correctness, silent failures, tests,
security, performance, and documentation. Select reviewers from the actual diff; do not
run every specialist mechanically. The main agent runs commands and verifies findings.

Use `adversarial-review` only when design assumptions, security, correctness, or material
tradeoffs require opposed positions. It uses isolated instances of the same
company-approved CLI in a background Herdr tab. Verify every finding against primary
evidence. A second agent is a source of hypotheses, not authority; same-model agreement is
not independent proof. If adversarial review is not warranted, state which condition was
absent rather than running it mechanically.

## 5. Report

Use [TEMPLATE.md](TEMPLATE.md). Include only evidence-backed findings. Distinguish:

- defects or contradictions that block merge;
- missing evidence that prevents judgment;
- non-blocking future considerations;
- limitations caused by missing access or skipped checks.

Write the report in Japanese unless the repository explicitly requires another language.
Preserve code identifiers, commands, and quotations in their original form.

Output the report in the conversation. Do not post it or edit the PR unless the user
separately authorizes an outward action. PR body generation remains prohibited.
