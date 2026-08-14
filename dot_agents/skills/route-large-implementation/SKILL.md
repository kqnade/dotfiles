---
name: route-large-implementation
description: Route an explicitly requested large implementation, or a clearly large Codex implementation, into independent isolated Herdr worktree units with client-matched coordinators. Claude routing requires an explicit user request and same-account repository authorization. Use only for outer topology and dispatch; ordinary small changes and execution in an existing worktree belong to their canonical skills.
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

## Route

1. Keep the current top-level router to shallow decomposition and dispatch.
   Preserve the current client: a Codex router dispatches Codex coordinators,
   and a Claude router dispatches Claude coordinators. Identify genuinely
   independent units and their disjoint paths from the request and known
   context. Do not implement, perform deep exploration, or make unit-level
   design decisions here.
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
   - HOW: constraints and the instruction to explicitly invoke the
     client-appropriate `execute-worktree-implementation` skill in the
     existing worktree;
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
