---
name: peer-consultation
description: Obtain and verify an independent second opinion on a concrete technical claim or decision. Use when the user asks to consult another agent or when a review has a material unresolved hypothesis; do not use merely to manufacture agreement.
---

# Peer Consultation

Use a separate reasoning context to expose blind spots, then decide from
evidence rather than votes.

## Define the challenge

State the decision, exact scope, constraints, and what evidence would change
the outcome. Ask for contrary explanations and important risks outside the
initial hypothesis. Do not send an entire conversation or reveal the desired
answer.

## Choose a permitted transport

Prefer a fresh native subagent when the harness provides one. Give it no prior
conversation history, or only the minimum bounded history required to inspect
the evidence package; do not fork the full conversation by default. Use an
external CLI or service only when the user explicitly selected it or the
account and repository boundary is already authorized. Do not infer permission
from an installed binary, and do not ask the peer to recursively create more
agents.

If no independent transport is available, continue the parent workflow and
state that consultation was not performed. Do not simulate independence in the
same reasoning context.

## Send a bounded evidence package

Provide the target paths, commit or diff, reproduction command, and primary
constraints needed to inspect the claim. Saved handoffs may identify questions
but are not authority. Require the peer to cite current code, command output,
or primary sources for material findings.

Default to one pass. Send one follow-up only when a decision-changing
disagreement or evidence gap remains; cap at two rounds unless the user asks
for more.

## Verify and synthesize

For each material peer claim:

1. locate its cited evidence;
2. reproduce or inspect it independently when practical;
3. classify it as confirmed, contradicted, unresolved, or out of scope;
4. preserve genuine disagreement instead of averaging opinions.

A decision-changing peer claim may change the recommendation only after the
parent workflow confirms it from current evidence. Otherwise retain the claim
as unresolved and state what verification is missing.

Report the question and transport, strongest peer findings, independent
verification, unresolved uncertainty, and recommended next action. Summarize
raw output unless the user requests the transcript.
