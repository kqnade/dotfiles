---
name: sanitize-artifacts
description: Sanitize generated or edited code, comments, documentation, and configuration so each artifact is closed over its committed version without conversation, request, diff, prior-version, prompt-example, or change-process residue. Use when inspecting, reviewing, polishing, or completing an artifact that refers to production instructions, tool choices, avoided approaches, external work history, or the editing session.
---

# Sanitize Artifacts

Treat every artifact as the complete state at its commit, not as a narration of
how that state was reached. Every statement must make sense from that version's
content and audience-facing contracts without the conversation, diff, prior
commit, issue, pull request, or editing session. Let Git explain history.

## Inspect the artifact

Read the artifact's purpose, the relevant diff, and enough surrounding context
to distinguish durable content from residue. Classify each candidate passage:

- Keep content that the artifact's intended audience needs to understand the
  current version's behavior, interface, safety boundary, or operating
  contract.
- Reflect production guidance indirectly through the artifact's structure,
  scope, terminology, defaults, or design; do not expose it as a disclaimer.
- Remove content whose meaning depends on the request, conversation, diff,
  editing session, previous wording, old implementation, ticket, pull request,
  or current change.
- Route context needed only for future agent continuity to repository workflow
  state through its authorized owner. Do not silently move it into source code
  or ordinary documentation, and do not create workflow state without the
  authorization required by that owner.

Do not infer residue from a keyword alone. A historical statement may be the
subject of an explicitly historical artifact; otherwise remove it when it
explains production or change history rather than the committed version.

## Remove edit-process narration

Delete or rewrite passages such as:

- "as requested", "as discussed", or references to the user or prompt;
- "now", "updated", "new", or "previously" when they merely announce this
  edit;
- "moved from", "consolidated into", "renamed from", or comparisons with an
  obsolete structure that Git already records;
- commit, branch, ticket, pull-request, or review references used to explain
  why current content exists;
- comments that restate an obvious code change or explain that an agent made
  it;
- tool choices, exclusions, avoided alternatives, or implementation constraints
  that matter only to the production process;
- examples copied from the conversation when they served only to communicate
  intent;
- headings, notes, or transitions that expose iterative corrections or
  patchwork between prompting rounds;
- notes about files being self-contained, complete, cleaned up, or ready after
  the current task.

Prefer deletion when the remaining artifact is already clear. Rewrite only
when the current version's audience still needs the underlying behavior or
contract.

```text
Wrong: Increased the timeout to 60 seconds as requested.
Right: Large imports can take up to 60 seconds.
```

Comments may state a current invariant, safety boundary, or external contract
that the code cannot express. Do not preserve a comment merely because it
explains why the edit was performed or how the implementation changed.

When returning an artifact in chat, keep any requested change summary outside
the artifact. Do not add a preface or annotation about sanitizing it to the
artifact itself.

## Verify the result

Apply these checks before finishing:

1. **Commit-snapshot test:** Read the artifact as the state at this commit. It
   must not depend on knowing what changed, why it changed, or what preceded it.
2. **Stranger test:** A reader without the conversation must understand every
   remaining sentence from the committed version and its audience-facing
   contracts alone.
3. **Production-context test:** Prompts, examples, tool choices, exclusions,
   and corrective feedback must influence the result without becoming visible
   content unless the intended audience needs them.
4. **Coherence test:** The artifact must use one consistent voice, terminology,
   and set of assumptions rather than reveal separate editing rounds.
5. **Memory-boundary test:** Information useful only to future agents must not
   leak into the artifact; retain it only through an explicitly authorized
   repository workflow-state operation.

Inspect the final diff for lost meaning and newly introduced residue. Treat any
unresolved residue as blocking: do not approve, commit, or report the work as
complete. Report the edit rationale in chat or Git-facing metadata, not in the
artifact.
