---
name: remove-conversation-residue
description: Remove conversation, request, and change-process residue from code, comments, documentation, and configuration while preserving stable technical rationale and required traceability. Use when an artifact narrates the edit that produced it, refers to prior structure or user instructions, or must read as a self-contained snapshot at its commit.
---

# Remove Conversation Residue

Treat every artifact as the complete state at its commit, not as a narration of
how that state was reached. Let Git history, commit messages, pull requests,
and the final chat response explain the change process.

## Inspect the artifact

Read the artifact's purpose, the relevant diff, and enough surrounding context
to distinguish durable content from residue. Classify each candidate passage:

- Keep subject-matter content that describes the artifact's actual state.
- Keep or rewrite technical rationale that explains a non-obvious invariant,
  constraint, risk, or external dependency.
- Keep formal traceability only when the artifact's contract requires it, such
  as an ADR, changelog, migration guide, or stable issue reference.
- Remove narration whose only referent is the request, conversation, editing
  session, previous wording, or current change.

Do not infer residue from a keyword alone. A temporal or historical statement
may be required by the artifact's subject matter; remove it only when it
describes the production of the artifact rather than the system it documents.

## Remove edit-process narration

Delete or rewrite passages such as:

- "as requested", "as discussed", or references to the user or prompt;
- "now", "updated", "new", or "previously" when they merely announce this
  edit;
- "moved from", "consolidated into", "renamed from", or comparisons with an
  obsolete structure that Git already records;
- comments that restate an obvious code change or explain that an agent made
  it;
- notes about files being self-contained, complete, cleaned up, or ready after
  the current task.

Prefer deletion when the remaining artifact is already clear. Rewrite only
when removing the residue would also remove a durable constraint or rationale.

```text
Wrong: Increased the timeout to 60 seconds as requested.
Right: Large imports can take up to 60 seconds.
```

Comments must explain a stable, non-obvious technical reason. Do not preserve a
comment merely because it explains why the edit was performed; ordinary change
history belongs to Git.

## Verify the result

Apply both checks before finishing:

1. **Commit-snapshot test:** Read the artifact as the state at this commit. It
   must not depend on knowing what changed to make sense.
2. **Stranger test:** A reader without the conversation must understand every
   remaining sentence from the artifact and its stable references alone.

Inspect the final diff for lost meaning and newly introduced residue. Treat any
unresolved residue as blocking: do not approve, commit, or report the work as
complete. Report the edit rationale in chat or Git-facing metadata, not in the
artifact.
