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

## Register a persistence obligation

Register an obligation only after the user explicitly authorizes this exact
state write (or explicitly authorizes the owning workflow to persist it). Read
the TODO and hash that snapshot, then use the materialized helper with that
hash:

```text
scripts/todo-obligation register --expect HASH TASK_KEY --id ID --owner OWNER --policy POLICY (--destination .dev/... | --no-save-reason REASON)
```

The helper resolves the target through `scripts/todo-path`, accepts only a
regular non-symlink TODO in the current worktree, and delegates the complete
replacement to the shared `workflow-state-write` compare-and-swap writer. Do
not bypass that resolver or implement a second lock or writer. Required
obligations use a destination and start `open`; conditional obligations use a
destination/open entry or a concrete no-save reason/closed entry; `none`
obligations use a concrete no-save reason and start `closed`. A destination
must remain under the canonical `.dev/` durable areas and use the owner's
permitted area. Destination and artifact paths use only portable ASCII letters,
digits, `.`, `_`, `-`, and `/`. Duplicate IDs, mixed or missing destination/reason fields,
unknown owners, and owner/policy mismatches are rejected.

Before registration or closure transforms the record, preflight the complete
existing obligation section. Permit canonical open obligations during this
mutation preflight, but reject malformed fields, unknown or mismatched
owner-policy pairs, duplicate IDs, invalid paths or closure shapes, and invalid
existing artifact evidence anywhere in the section. A failed preflight must
leave the TODO byte-for-byte unchanged; the writer's lock and expected hash
still guard the later replacement.

Derive owner policies from the canonical persistence policy registry in
`using-workflow-skills`; do not maintain an independent semantic mapping.
`todo-management` is the registry's required mechanical active-state owner,
not a semantic durable-artifact obligation owner, so it is never accepted as
an obligation entry owner. Prospective `.dev/reviews/<review-key>.md` remains
unavailable until the shared writer's availability gate changes; the shared
workflow-state writer rejects `.dev/reviews/` today.

Close an obligation only after the user explicitly authorizes this exact state
write (or explicitly authorizes the owning workflow to persist it). Re-read the
TODO and hash that exact snapshot. For artifact closure, create the declared
artifact in the current worktree; for no-save closure, prepare a concrete
reason. Then use the materialized helper with that hash:

```text
scripts/todo-obligation close --expect HASH TASK_KEY --id ID --artifact .dev/...
scripts/todo-obligation close --expect HASH TASK_KEY --id ID --no-save-reason REASON
```

Closure accepts exactly one of `--artifact` and `--no-save-reason` for one
existing `open` obligation. Artifact closure requires `--artifact` to exactly
match the declared destination and resolve to a regular, non-symlink file in
the current worktree and the owner's permitted `.dev/` area. A no-save closure
requires a `conditional` obligation with its canonical owner and destination,
and `REASON` must be one nonblank, concrete line; it changes `State` to
`closed`, removes `Destination`, and records `No-save reason: REASON`.
`required` obligations reject no-save closure and remain unchanged. `none`
obligations start closed at registration and cannot transition. Stale hashes,
target locks, malformed obligation blocks, and invalid artifact or reason
inputs leave the TODO unchanged. Both closure modes delegate the complete
replacement to the shared `workflow-state-write --expect` compare-and-swap
boundary.

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
and nonregular targets. Before deletion it invokes the read-only
`scripts/todo-obligation check <task-key>` seam. The optional `## Persistence
obligations` section may be absent, heading-only, or contain zero or more
unique canonical `### \`id\`` blocks, but it may occur at most once before
`Commit checklist`. Each block uses the exact `Owner`, `Policy`, `State`, and
one closure form in canonical order. Every block must be `closed`: artifact
closures keep a safe owner-allowed `Destination` and use a nonempty safe-label
Markdown link whose target is exactly `../${Destination#.dev/}` and resolves
through the current worktree to an existing regular non-symlink file; no-save
closures use `conditional` or `none` with a concrete single-line reason.
Unknown owner/policy pairs, open or malformed blocks, duplicate IDs, mixed or
missing closure fields, unsafe paths, invalid links, and stale artifact
evidence preserve the TODO and block completion. A concrete `None` reason is
valid only when no durable record is warranted.

The helper deletes only an eligible current-worktree TODO through the shared
record lock and compare-and-swap writer. If validation or deletion fails,
leave the item active, re-read current state, and report the failed gate.

## Report

Report the task key, exact current-worktree path, operation performed, and
verification. On conflict or failed validation, leave the existing item
unchanged and report the failure.
