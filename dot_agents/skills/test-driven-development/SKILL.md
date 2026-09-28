---
name: test-driven-development
description: Implement executable behavior or fix a defect through a short List → Red → Green → Refactor cycle. Use for feature implementation and bug fixes, not review-only requests or documentation-only changes.
---

# Test-Driven Development

Follow the current request, repository instructions, and client/account restrictions.
Preserve unrelated changes. Do not change clients or accounts as a fallback, or
publish, push, or mutate shared environments without explicit authorization.

## Choose the next behavior

Inspect the affected code and tests. Keep a short list of observable examples:
normal behavior, boundaries, and failures. Choose the smallest useful example.
A small task does not need a separate plan document, saved TODO, or delegation.
Clarify an unresolved requirement only when it changes the implementation.

For documentation, generated output, or configuration without a practical test
seam, use a proportionate deterministic check and explain that TDD does not apply.
Do not label a test written after the implementation as evidence of Red.

## Repeat List → Red → Green → Refactor

1. **Red:** Turn one example into a test of observable behavior. Run it and
   confirm it fails for the expected reason. A setup error is not Red; an
   unexpected pass requires investigation. Do not derive the expected value
   by copying the implementation's output.
2. **Green:** Make the smallest change that passes the test. Run the relevant
   existing tests too. Do not weaken assertions, hide failures, or include
   unrelated cleanup to obtain Green.
3. **Refactor:** Improve only what the examples justify while tests stay green.
   Avoid speculative abstractions. Add newly discovered behavior to the list,
   then take the next example.

Prefer real collaborators where practical; use test doubles at genuine external,
slow, or nondeterministic boundaries. Keep command results in the conversation;
this cycle does not itself require a persistent record or a commit.

## Finish

Run the verification appropriate to the changed behavior and repository contract.
Read and apply [sanitize-artifacts](../sanitize-artifacts/SKILL.md) to the final
diff; unresolved residue is blocking. Recheck the diff for unintended changes.
For complex or high-risk changes, use a fresh read-only review through the
current client's authorized mechanism, without introducing another dispatch layer.

Report the behavior changed, verification commands and results, and anything
unverified or intentionally incomplete. State failures explicitly. Persist a
handoff only when requested; follow repository rules for commits and publication.
