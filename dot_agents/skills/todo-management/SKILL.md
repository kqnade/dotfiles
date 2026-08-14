---
name: todo-management
description: Create, update, or complete repository-owned active work items in the current Git worktree's `.dev/todo/`. Use only when the user explicitly asks to manage TODO state or explicitly authorizes a workflow to persist an active work item; preserve concurrent changes and promote durable records before completion.
---

# TODO Management

Manage only active, commit-oriented work items. Do not create a TODO merely
because a task may span multiple steps, and do not treat completed TODO files
as an archive.

## Confirm authorization and resolve the target

Before every write, confirm that the user explicitly requested the exact TODO
creation, update, or completion, or explicitly authorized the owning workflow
to persist that active item. An invocation does not authorize unrelated `.dev`
writes, another worktree, an external backend, or remote publication.

Use `scripts/todo-path <task-key>` for read-only resolution and
`scripts/todo-path --ensure <task-key>` only after write authorization. The
task key is a stable lowercase slug beginning with a letter or digit and using
only letters, digits, `.`, `_`, and `-`. The resolver must remain in the
current Git worktree and rejects `AGENT_WORKFLOW_STATE_HOME`; do not bypass it
with a manually assembled path.

Read an existing exact-task TODO before changing it. Check its provenance and
freshness against the current request, files, Git state, tests, and runtime.
Do not load unrelated TODOs as context.

## Keep the active-item schema

Every managed TODO contains these sections:

- `Objective`: the state that will be true when the work is complete;
- `Scope`: the bounded work this item owns;
- `Non-goals`: adjacent work intentionally excluded;
- `Durable records`: relative links to required `.dev` records, or one
  concrete `None` reason when no durable record is warranted;
- `Commit checklist`: independently reviewable, verifiable, revertible Green
  increments.

Keep observations labeled and attach current provenance when they influence a
decision. Mark intentionally incomplete increments and their remaining stable
tracking item.

## Create or update safely

Resolve the target with `scripts/todo-path --ensure`. For a new item, pipe the
complete document to
`../using-workflow-skills/scripts/workflow-state-write --expect missing
<absolute-target>`. For an update, first hash the file with
`git hash-object --no-filters <absolute-target>`, then pass that hash through
`--expect` to the same writer.

The writer locks one record and atomically replaces it. If it reports a stale
hash, re-read and reconcile instead of retrying blindly. Inspect a leftover
lock and ask before removing that exact lock; never clear it based only on age.

## Complete an item

Before completion, write every linked durable record first. Mark the final
checklist item complete, re-read the TODO, and hash that exact version. Run
`scripts/todo-complete --expect <hash> <task-key>`. The helper rejects missing
required sections, unchecked or empty checklists, missing or out-of-scope
durable record links, mixed `None` and link entries, stale hashes, symlinks,
and nonregular targets. A concrete `None` reason is valid only when no durable
record is warranted.

The helper deletes only an eligible current-worktree TODO through the shared
record lock and compare-and-swap writer. If validation or deletion fails,
leave the item active, re-read current state, and report the failed gate.

## Report

Report the task key, exact current-worktree path, operation performed, and
verification. On conflict or failed validation, leave the existing item
unchanged and report the failure.
