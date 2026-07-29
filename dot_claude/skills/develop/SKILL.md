---
name: develop
description: >-
  Use when implementing a feature, fixing a bug, or refactoring code.
  Maintains `.dev/` as the source of truth, decomposes work into commit-sized TODOs,
  follows red-green TDD, verifies each item, and creates traceable commits.
argument-hint: "[work item, issue, or desired behavior]"
---

# Develop

Implement `$ARGUMENTS` as a sequence of independently verifiable commits.

## 1. Establish the source of truth

Read repository instructions and relevant existing `.dev/` documents before planning.
Use one canonical location for each kind of information:

- `.dev/research/`: facts, sources, experiments, and unresolved questions
- `.dev/designdoc/`: the proposed implementation, constraints, interfaces, rollout, and verification
- `.dev/adr/`: a durable decision with alternatives and consequences
- `.dev/todo/`: the active executable work plan, removed when the work is complete
- `.dev/contexts/`: session handoff context, not duplicated design documentation

Create or update an artifact only when it has durable value:

- Research when an unknown must be resolved with evidence.
- A DesignDoc when the implementation has meaningful alternatives, interfaces, migration, or operational risk.
- An ADR when future maintainers must understand why one durable option won.
- A TODO for the requested work. Link it to any relevant research, DesignDoc, or ADR.

## 2. Decompose before implementation

In `.dev/todo/<work-item>.md`, record the goal and a checklist. Every checklist item must:

- describe one observable outcome;
- state how it will be verified;
- be small enough for one cohesive commit;
- be independently reviewable and revertible;
- avoid unrelated cleanup.

Do not start implementation until the next TODO item is clear. Work on one item at a time.

## 3. Complete each TODO with evidence

For a behavior change:

1. Write the smallest test that expresses the next behavior.
2. Run it before implementation and confirm it fails for the expected reason.
3. Implement the minimum change that makes it pass.
4. Run the focused test and relevant regression checks.
5. Refactor only while the tests remain green.

For a bug, the first test must reproduce the reported failure. For a behavior-preserving
refactor, establish passing characterization tests before changing structure.

If a test cannot reasonably exercise the change, write the reason and an alternative
verification command or observation in the TODO before implementation.

Inline comments may explain only non-obvious reasons, invariants, constraints, or
tradeoffs. Express what and how through naming and code structure.

## 4. Commit the completed item

After verification:

1. Mark the TODO item complete and record the verification performed. If it is the final
   item, delete the TODO file instead of keeping a completed work plan.
2. Review the diff for unrelated changes and accidental generated or secret files.
3. Commit the implementation, tests, and directly related `.dev/` updates together.
4. Match the repository's commit-message convention and include an issue or task reference when available.

Commit relevant `.dev/contexts/` records so the decision process remains traceable.
Keep durable decisions in a DesignDoc or ADR and conversation-only handoff facts in a
context; do not retain the completed TODO as an archive. Never commit a red state, combine
multiple unfinished TODOs, or generate a pull request body.

## 5. Finish or hand off

Continue with the next TODO only after the previous commit succeeds. When stopping with
unfinished work, update the TODO and use `/conversation-context-export` to preserve
conversation-only context without duplicating the DesignDoc, ADR, research, or TODO.
