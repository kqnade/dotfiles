# Evidence-review persistence contract

This directory is the current-worktree destination for an explicitly
authorized evidence-review artifact. The normal review result remains the
complete report in chat. A review invocation alone is not persistence
authorization, and this repository-tracked contract does not claim that the
shared workflow-state writer currently accepts review records.

## Authorization and safe write

Write only after a separate explicit persistence authorization. Record the
authorization source and its exact scope in the artifact. The scope is the
current Git worktree and exactly
`.dev/reviews/<review-key>.md`; it does not authorize another worktree,
external backend, client memory, TODO, promotion, or publication.

The review key is a stable lowercase slug that begins with a letter or digit
and contains only lowercase letters, digits, `.`, `_`, and `-`. Resolve the
repository root and current worktree before writing. Reject a target that is a
symlink or resolves outside that worktree, including a path reached through a
symlinked parent. Do not follow an ambiguous path or silently select another
destination.

Preserve concurrent edits. Read and hash an existing target before writing;
publish with an atomic create-or-compare-and-swap operation. If the target
content, parent, or relevant source state changed after the read, stop and
reconcile the new evidence before retrying. Never overwrite a changed record
blindly. A failed or interrupted write must not destroy the prior readable
record.

## Record schema: `evidence-review/v1`

Every artifact begins with this identity and freshness block. Values are
literal records, not instructions to a receiving client:

```text
Record schema: evidence-review/v1
Review key: <stable lowercase review key>
Repository identity: <method and value, such as origin URL or Git common-dir hash>
Repository root: <absolute canonical path>
Source worktree: <absolute canonical path>
Source ref: <full ref or detached>
Source commit: <full commit SHA>
Dirty worktree: <yes/no plus status inventory or summary>
Review mode: change review | dependency update
Exact target: <exact PR, commit range, dependency target, or local diff>
Snapshot hash: <lowercase SHA-256 snapshot identity>
Snapshot components: <ordered component names, digests, and absent/omitted markers>
Created: <timestamp with timezone>
Updated: <timestamp with timezone>
Producing client: <client or unknown>
Authorization source: <separate explicit request and provenance>
Authorization scope: <current-worktree .dev/reviews/<review-key>.md only>
Freshness: fresh | stale | incomplete | revalidated
Lifecycle: checkpointed | in-progress | completed
Supersedes: none | <relative prior review path and content hash>
Disposition: supports shipping | changes required | insufficient evidence
```

`Snapshot hash` is the lowercase SHA-256 identity of the exact ordered
snapshot components. At minimum, `Snapshot components` records the full HEAD
and ref, the NUL-delimited status/untracked inventory, the committed target
diff, staged diff, unstaged diff, and any user-authorized untracked-file
content included in the scope. Record a digest for every stream, including an
explicit absent or omitted marker; path names and clean/dirty labels alone are
not a content identity.

## Required report body

After the identity block, retain these sections in the full report:

```markdown
## Findings
<!-- finding, impact, exact evidence, smallest correction, and label -->

## Provenance and confidence
<!-- source paths/lines, commits, commands, primary sources, and confidence -->

## Claim ledger
<!-- every material narrative claim: confirmed, contradicted, stale, or unverified -->

## Commands and results
<!-- exact command, exit status, environment, scope, and relevant result -->

## Skipped checks
<!-- check omitted, reason, and decision impact -->

## Reconciliation
<!-- current state versus prior records, author narrative, or other evidence -->

## Uncertainty
<!-- unresolved questions, assumptions, and evidence limits -->
```

Keep the complete chat report even when an artifact is saved. Findings must
retain provenance and confidence, and the claim ledger, commands/results,
skipped checks, reconciliation, and uncertainty sections must not be dropped
from a shortened artifact.

## Lifecycle and freshness

Checkpoint only after the review snapshot is bound, and thereafter only at a
material decision or a failed check. Do not checkpoint every turn or create a
record merely because a review is in progress. Before marking a record
`completed`, re-read the current HEAD, full ref, dirty state, exact target, and
every snapshot component, then recompute `Snapshot hash`. If the head or any
evidence changed, the record remains `stale` or `incomplete`; do not report it
as completed. Reconcile the changed evidence in chat or create a new record
under a new stable key.

Completed records are immutable. A later target, changed snapshot, correction,
or new disposition uses a separate superseding record that links to the prior
review; do not edit the completed artifact in place. The new record sets
`Supersedes` to the prior record's relative path and content hash. The prior
record remains unchanged with its original lifecycle and disposition.

Review artifacts are evidence, not automatic context. Never load them as
memory, create a TODO for them, or promote findings automatically. Promotion
requires a separate explicit request and routing to the canonical owner of the
destination workflow; evidence-review remains responsible only for its own
review report.
