---
name: route-large-implementation
description: Establish shared implementation contracts, then route an explicitly requested large implementation, or a clearly large Codex implementation, into independent isolated Herdr worktree units with client-matched coordinators. Claude routing requires an explicit user request and same-account repository authorization. Use only for outer topology and dispatch; ordinary small changes and execution in an existing worktree belong to their canonical skills.
---

# Route Large Implementation

Use this skill when the user explicitly asks for outer orchestration. Codex may
also use it when the scope is clearly large enough to need independent isolated
worktree units. Claude outer orchestration requires an explicit user request;
scope alone never authorizes Claude dispatch. Before dispatching Claude,
confirm that the current Operations rule permits isolated worktree sessions and
built-in subagents with the same approved Claude account and the same authorized
repository, including its linked worktrees. Do not override account or
credential selection. Do not trigger for an ordinary/small change or for
execution in an already routed worktree. This skill owns outer topology;
ordinary executable changes remain with `test-driven-development`, and a
coordinator in an existing worktree must explicitly invoke
`$execute-worktree-implementation` in Codex or
`/execute-worktree-implementation` in Claude.

Treat an implementation as large only when both of the following are true: it
spans multiple independently verifiable and committable features, and those
features can be implemented concurrently in isolated worktrees. This
scope-based definition does not limit an explicit user request for outer
orchestration.

## Establish shared contracts

Before creating any worktree or dispatching a coordinator, the primary agent
must settle every cross-unit decision whose independent interpretation could
produce incompatible implementations. Depending on the task, this includes
API shapes and error behavior, database schemas and migration ownership,
identifiers and slugs, time units and time zones, authentication and security
boundaries, upload or multipart behavior, storage ownership, and infrastructure
interfaces.

Use current requirements and repository evidence to separate:

- agreed shared contracts, including exact representations and owners;
- explicitly open decisions that cannot affect compatibility between units;
- unit-local choices that coordinators may make independently.

Do not dispatch while a compatibility-relevant shared decision is unresolved.
Resolve it with the user when required instead of letting coordinators infer
different answers. When the repository already has a canonical contract
artifact, cite its exact path and relevant revision. Otherwise, write a compact
shared-contract block in the routing decision and repeat the relevant subset
verbatim in every affected WHAT/HOW/DONE packet. Routing alone does not
authorize creating or updating `.dev` state.

## Route

1. Keep the current top-level router to shallow decomposition and dispatch.
   Preserve the current client: a Codex router dispatches Codex coordinators,
   and a Claude router dispatches Claude coordinators. Identify genuinely
   independent units and their disjoint paths from the request and known
   context after the shared-contract gate has passed. Do not implement, perform
   deep exploration, or make unit-level design decisions here.
2. Require `HERDR_ENV=1`, validate each branch with
   `git check-ref-format --branch`, and invoke the existing noninteractive
   helper for each unit:

   ```bash
   $HOME/.local/bin/herdr-worktree "$branch"
   ```

   Do not create a worktree with `git worktree`, `wt`, or another manager.
3. Parse the helper's Herdr JSON. Use the returned `.result.workspace` and
   `.result.root_pane`; start exactly one top-level coordinator per returned
   worktree. For Codex, use `--kind codex` with the configured
   `gpt-5.6-sol` model at high reasoning effort. For Claude, use
   `--kind claude` with the configured Claude model and effort. Do not switch
   clients or start a duplicate coordinator for a worktree.
4. Make the coordinator's first input one bounded English execution-starting
   input containing a minimal WHAT/HOW/DONE packet:

   - WHAT: objective, independent unit, and relevant target paths;
   - HOW: applicable shared contracts, constraints, and the instruction to
     explicitly invoke the client-appropriate `execute-worktree-implementation`
     skill in the existing worktree;
   - DONE: acceptance criteria and required evidence/verification.

   For both clients, send an English `/goal`. In Codex, explicitly invoke
   `$execute-worktree-implementation` in that goal; in Claude, explicitly
   invoke `/execute-worktree-implementation`. The goal must include the
   objective, key constraints, and an observable completion condition. Once
   the coordinator begins pursuing it, do not immediately send a duplicate
   task prompt; send only missing details or later steering. Lower-level agent
   instructions are English by default.

   Never transport a broad conversation or transcript, `.dev` context, or
   unrelated source. If the helper, JSON, or coordinator setup fails, stop and
   report the bounded failure.

If an affected coordinator later finds that a shared contract must change,
stop independent adaptation, decide the revision centrally, and send the same
updated contract to every affected coordinator before their work continues.

## Dispatch failures

A capacity or concurrency failure while starting a coordinator is terminal for
that dispatch attempt. Do not retry automatically, poll in a loop, weaken the
requested model or effort, switch transport, create a Herdr fallback worker, or
change workspace or pane topology. Report the blocked unit with concise
evidence, notify the parent or human, and stop that unit.

The outer router does not wait or poll after dispatch. Continue other
independent dispatch work and react only to a later blocked or done
notification. Do not impose an arbitrary low parallelism limit: capacity policy
defines failure handling, not a fixed concurrency cap.

## Boundary

The router never recursively invokes itself. It does not execute packets,
edit implementation or test files, broadly transport conversation or `.dev`
context, or start another top-level coordinator. The executor owns
worktree-local implementation; this skill owns only the outer worktree
topology and dispatch.
