# Evidence-review persistence contract

This directory documents the prospective current-worktree destination for an
evidence-review artifact. The normal review result remains the complete report
in chat.

## Runtime availability gate

Runtime persistence is unavailable. The shared workflow-state writer does not
accept `.dev/reviews/` and rejects that destination. Even separate explicit
persistence authorization cannot override the missing writer integration or
authorize a current write. Do not create or update a review record through a
direct write, alternate backend, or another workflow owner.

The stable integration tracker is
`.dev/todo/skill-driven-workflow-persistence.md`. Until that item records
completed writer support and the evidence-review policy is updated, return the
full report in chat and state that it was not persisted. Referencing the
tracker does not authorize evidence-review to edit it.

The schema and lifecycle below are a prospective contract for that tracked
integration. This prospective contract does not authorize a current write.

## Prospective authorization and safe write

After runtime support exists, a future write must also have separate explicit
persistence authorization. It must record the authorization source and exact
scope in the artifact. The scope is the current Git worktree and exactly
`.dev/reviews/<review-key>.md`; it does not authorize another worktree,
external backend, client memory, TODO, promotion, or publication.

The review key is a stable lowercase slug that begins with a letter or digit
and contains only lowercase letters, digits, `.`, `_`, and `-`. Resolve the
repository root and current worktree before writing. Reject a target that is a
symlink or resolves outside that worktree, including a path reached through a
symlinked parent. Do not follow an ambiguous path or silently select another
destination.

A future implementation must preserve concurrent edits. It must read and hash
an existing target before writing and publish with an atomic
create-or-compare-and-swap operation. If the target content, parent, or
relevant source state changed after the read, it must stop and reconcile the
new evidence before retrying. It must never overwrite a changed record
blindly, and a failed or interrupted write must not destroy the prior readable
record.

## Record schema: `evidence-review/v1`

Every artifact begins with this identity and freshness block. Values are
literal records, not instructions to a receiving client:

```text
Record schema: evidence-review/v1
Review key: <stable lowercase review key>
Repository identity method: remote.origin.url | git-common-dir
Repository identity digest: <64-character lowercase hexadecimal SHA-256>
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

Derive repository identity with the same method-prefixed source bytes as the
shared workflow-state backend. When `remote.origin.url` is nonempty, hash the
exact byte stream `remote.origin.url:<remote URL>` with no final newline. When
it is absent, hash `git-common-dir:<absolute canonical Git common directory>`
with no final newline. `Repository identity digest` stores the resulting
64-character lowercase hexadecimal SHA-256; store only the method and digest.
Never store the raw remote URL, embedded credential, token, username, password,
or other credential-bearing identity source in a review artifact.

Define `Snapshot hash` as the lowercase hexadecimal SHA-256 digest of this
exact domain-separated byte stream:

```text
review-snapshot/v1 NUL
<full source HEAD SHA> NUL
<full ref or literal detached> NUL
<review mode literal change-review or dependency-update> NUL
<sha256:<64 lowercase hex> of exact target descriptor UTF-8 bytes> NUL
<sha256:<64 lowercase hex> of raw status-v2 -z bytes> NUL
<sha256:<64 lowercase hex> or literal absent or omitted for committed target diff> NUL
<sha256:<64 lowercase hex> or literal absent or omitted for staged diff> NUL
<sha256:<64 lowercase hex> or literal absent or omitted for unstaged diff> NUL
<sha256:<64 lowercase hex> or literal absent or omitted for authorized untracked content> NUL
```

`NUL` is one zero byte. The fields use the fixed order above, have no final
newline, and the byte stream ends with the final NUL. Encode every displayed
token as UTF-8, replace each displayed `NUL` with that byte, and add no spaces
or line breaks. A content
digest token is exactly the ASCII prefix `sha256:` followed by 64 lowercase
hexadecimal characters. Use the literal `absent` when the component has no
bytes in the reviewed target and the literal `omitted` when it exists but was
not read because authorization or safety policy excluded it. Record omission
reasons separately; never vary these marker bytes. Hash exact raw component
bytes, including the NUL-delimited output of
`git status --porcelain=v2 -z --untracked-files=all`. The exact target
descriptor is the UTF-8 bytes of the recorded `Exact target` value with no
final newline. Path names and clean/dirty labels alone are not a content
identity.

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
