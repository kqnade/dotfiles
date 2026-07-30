---
name: project-memory
description: >-
  Record, retrieve, or revise confirmed repository-scoped knowledge in `.dev/memory/`.
  Use when a fact or procedure should be reused across work items, or when existing project
  memory may affect the current task. Never use memory as a substitute for PR-scoped context.
argument-hint: "[record | recall | revise] [topic]"
---

# Project Memory

Read `.dev/memory/README.md` before using project memory.

## Boundary

Context and memory are different records:

- `.dev/contexts/` preserves detailed dialogue output, implementation work, failures, and
  verification for a specific branch, change, or PR. It is review evidence and must not be
  reduced or deleted.
- `.dev/memory/` contains confirmed knowledge intended for reuse across future work items.
  It is derived from evidence and may be revised when that evidence changes.

Never summarize, move, or delete context to create memory. Never load unrelated context as
memory.

## Record

Record memory only when it is repository-scoped, confirmed, reusable across work items, and
not already obvious from current code or canonical instructions.

Create or update one topic file under `.dev/memory/` using the format in its README. Link the
context, ADR, DesignDoc, research, code, or commit that proves each claim. Do not store
secrets, credentials, personal profiles, unverified inferences, task logs, or PR-only detail.

## Recall

Search filenames and contents for the current topic. Read only relevant entries and their
sources. Verify the memory against current repository state before acting on it. Report stale
or contradicted memory instead of silently trusting it.

## Revise

Update an entry when its source evidence changes. Mark it `Superseded` when historical
knowledge still explains existing behavior; otherwise replace an invalid claim while
preserving links to the evidence that invalidated it.
