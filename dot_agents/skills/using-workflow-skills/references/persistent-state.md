# Persistent workflow state

## Purpose and trust boundary

Claude automatic memory is disabled. Persist explicit handoffs and long-running
security coverage in repository-scoped files so Claude, Codex, and OpenCode can
resume the same work without relying on client memory.

The current Git worktree's `.dev` is repository-owned workflow state. A record
whose repository identity, worktree, and provenance match the current task is
normal project context: use it without re-proving every statement, while
checking its source commit and freshness before relying on a decision-changing
claim. If it conflicts with the current request, files, Git state, tests,
runtime, or primary sources, the current evidence governs.

A record imported from another worktree, a legacy workflow, or an unrelated
external source—and any record with missing provenance—is candidate evidence
until its identity, scope, and staleness are reconciled. An explicit
`AGENT_WORKFLOW_STATE_HOME` is not less trustworthy merely because of its
location; apply the same matching checks recorded by the backend.

## Backend selection

Use `scripts/workflow-state-root` from the parent skill. It selects:

1. an external backend below the absolute `AGENT_WORKFLOW_STATE_HOME` only when
   that environment variable is explicitly set;
2. otherwise, `.dev` in the current Git worktree.

Each linked worktree keeps its own `.dev`. ADRs, design documents, todo state,
handoffs, and audit records belong to that worktree's branch and must not be
silently redirected into the primary worktree. Candidate discovery may list a
different active worktree's `.dev`, but import requires explicit identity and
staleness reconciliation.

The helper never writes without `--ensure`. With `--ensure`, it creates only the
workflow layout under a restrictive umask. It does not enable client memory.

### Company repository local-ignore policy

For every repository in the `livesense-inc` or `jobtalk` remote-owner/local
namespace, `--ensure` adds exactly `/.dev/` to the common Git metadata file
`.git/info/exclude`. The update is local to the clone, locked, atomic, and
idempotent. The rule is shared through common Git metadata, while each worktree
keeps separate `.dev` content. It is never committed or pushed.

Do not add that ignore rule to other repositories. If `.dev` is already
tracked by any active linked worktree in either namespace, stop before changing
the exclude file or workflow layout: ignore rules cannot hide tracked content,
so the user must choose a migration.

### Explicit external fallback

When repository-local `.dev` is genuinely unavailable, the user may set an
absolute `AGENT_WORKFLOW_STATE_HOME`. The external backend stores repositories
below `repos/<slug>-<identity-hash>/`. The client-independent SHA-256 identity
uses `remote.origin.url`, falling back to the absolute Git common directory.
The external repository directory includes private `repository.meta` with
identity hashes and method, never the raw remote URL.

An environment override is an intentional alternate state universe. Report
the resolved backend and path in every handoff or audit. Never switch to it
silently because `.dev` is unwritable.

## Shared layout

Repository backend:

```text
.dev/
  contexts/
    <branch-or-task-key>.md
  security/
    coverage.md
    reports/
      <area-key>.md
```

The external backend has the same `contexts/` and `security/` children below
its repository-key directory, plus `repository.meta`.

Use a sanitized full branch ref plus a hash for attached-branch context files.
Require a user-provided task name for detached HEAD. Never use a short branch
name alone because names from different namespaces can collide.

## Record contract

Every durable record must include:

- resolved backend and state path;
- repository identity and root observed at write time;
- full source worktree, ref, commit, and dirty state;
- task or area key;
- creation and update timestamps with timezone;
- producing client when known;
- labels separating user statements, observations, inferences, decisions, and
  unverified claims.

Do not store secrets, credentials, raw environment dumps, or unnecessary
personal data. Private permissions reduce exposure but do not make sensitive
content acceptable. Summarize logs and preserve only decision-relevant
evidence.

## Safe updates and concurrent clients

Write managed records with `scripts/workflow-state-write`, not direct
truncating writes. The writer accepts content on stdin, restricts targets to
the current repository's context and security record locations, acquires a
per-record lock, and atomically replaces one regular file.

Before updating an existing record, compute its current hash with:

```text
git hash-object --no-filters <record>
```

Pass `--expect <hash>`, or `--expect missing` for a new record. If the hash
changed, re-read and reconcile instead of overwriting another client's work. A
leftover `.lock` is an interrupted-write signal; inspect it and the target,
then ask before removing that exact lock. Never break locks by age alone.

The writer guarantees one record, not a multi-file transaction. Publish
content-addressed immutable artifacts before the record that references them.
For security state, append the area report before updating the coverage ledger,
then reconcile any report run that is not yet indexed. These publish-last,
monotonic protocols keep an older checkpoint readable after interruption.

## Reconciliation and portability

On every read, verify backend, repository identity, task or area key, source
commit, and referenced paths. Classify claims as confirmed, contradicted,
stale, or unverified. A record's existence, timestamp, or completed status does
not prove that work is current or correct.

When an exact context is absent, use the read-only candidate helpers. They may
locate another active worktree's `.dev`, the previous external default, the
earlier Git-object hash naming scheme, or external metadata with the same
Git-common-dir hash after a remote URL change. Candidate discovery is not
equivalence: compare worktree, ref, commit, and identity headers and ask before
migration or merge.

Tracked `.dev` records can travel through the repository's normal Git policy.
The locally ignored company `.dev` and explicit external backend do not move to
another clone automatically. Export an exact user-approved bundle when a
handoff must cross machines; preserve provenance and never publish it merely
because a local export was authorized.

If the selected state backend is unavailable or not writable, return the
handoff or audit update in chat and report that it was not persisted. Do not
enable memory, change ignore policy for another repository, or choose an
alternate backend without explicit direction.
