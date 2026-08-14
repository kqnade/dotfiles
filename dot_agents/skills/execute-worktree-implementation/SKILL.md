---
name: execute-worktree-implementation
description: Execute an explicitly invoked implementation packet in an existing isolated worktree. Use only for bounded worktree-local implementation; do not choose or create worktrees, orchestrate sessions, or replace ordinary small-change TDD.
---

# Execute Worktree Implementation

This skill starts only when a route packet explicitly invokes it and the
current directory is the packet's existing isolated worktree. Require one
active execution-starting input containing the objective, key constraints,
and an observable completion condition: one bounded English `/goal` for either
Codex or Claude. If either the explicit invocation, packet, or existing
worktree is missing, stop and return to the outer router or the ordinary
`test-driven-development` owner. The packet invokes this skill as
`$execute-worktree-implementation` in Codex or
`/execute-worktree-implementation` in Claude. If this coordinator is already
pursuing that input, do not immediately send a duplicate task prompt; send only
missing details or later steering. Lower-level agent instructions are English
by default.

## Plan and delegate

1. Create a concrete todo list and a behavior-test list from WHAT/HOW/DONE.
   Keep both lists bounded to the packet and identify the verification command
   and evidence expected for each item.
2. Start one or more parallel, read-only scouts while preserving the
   coordinator's client. Use `gpt-5.6-luna` at max effort for Codex delegates;
   use fresh Claude general-purpose subagents that inherit the configured
   Claude model and effort for Claude delegates. Give each scout one bounded
   ordinary prompt containing the scout objective, read-only constraint, and
   observable completion condition: concise file references, test seams,
   dependencies, and uncertainties. Send only missing details or later
   steering after that prompt. Scouts do not write files.
3. The coordinator selects the approach from scout evidence and creates very
   small atomic packets. Every packet must state behavior, target files/seam,
   verification command, constraints/non-goals, and completion evidence. Keep
   packet context minimal. Partition disjoint writes for parallel workers and
   serialize any overlapping writes.
4. Give each packet to a fresh client-matched worker: `gpt-5.6-luna` at max
   effort for Codex, or a Claude subagent with the configured Claude model and
   effort. Give the worker one bounded ordinary prompt containing the behavior,
   target files/seam, key constraints/non-goals, and observable completion
   evidence/verification command. Explicitly invoke
   `$test-driven-development` for a Codex worker. For a Claude worker, instruct
   it in that prompt to use the Skill tool to invoke
   `/test-driven-development` before each executable behavior cycle. That skill
   owns the List → Red → Green → Refactor method, so do not duplicate it here.

## Dispatch failures

A capacity or concurrency failure while starting a scout or coding worker is
terminal for that dispatch attempt. Do not retry automatically, poll in a loop,
weaken the requested model or effort, switch transport, create a Herdr fallback
worker, or change workspace or pane topology. Report the blocked unit with
concise evidence, notify the coordinator or human, and stop that unit. Continue
other independent work and react only to later blocked or done notifications.
Do not impose an arbitrary low parallelism limit: capacity policy defines
failure handling, not a fixed concurrency cap.

## Verify each Green

For every Green increment, the coordinator verifies the worker's command and
relevant tests, stages only that increment's paths, and inspects `git status`,
the staged diff, and test results before committing. Commit every Green with
the current client and repository's required commit path: Codex uses `git cc`
where authorized; Claude generates the same reviewed message style in the
current session and uses `git commit -m` without invoking `git cc`. Never begin
another increment from a known Red state. After the todo/test lists are
complete, run the applicable repository and skill validation,
`git diff --check`, and a clean-status check. Stop before push, pull-request
creation/editing, or any other remote mutation; those require separate
explicit authorization.

## Hard boundary

The executor must never create or choose a worktree, call
`herdr-worktree`, `wt`, or `git worktree`, start another top-level coordinator,
or invoke `$route-large-implementation`. It owns execution inside the already
selected worktree only; the router owns outer topology.
