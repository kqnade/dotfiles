# Development

Project-specific instructions take precedence for commands, naming, and repository conventions.

## Source of truth

Development records live under `.dev/`. Do not duplicate the same information; link to its canonical document.

- `.dev/adr/`: durable architecture decisions, alternatives, and consequences
- `.dev/designdoc/`: implementation designs, constraints, interfaces, and verification plans
- `.dev/research/`: evidence, experiments, sources, and unresolved questions
- `.dev/contexts/`: detailed dialogue output and work evidence for a branch, change, or PR
- `.dev/memory/`: confirmed repository knowledge reusable across work items
- `.dev/todo/`: active work plans only; delete a plan when its final item is complete

Context is not memory. Context is PR and Sanity Review evidence; never reduce, delete, or
load unrelated context as reusable knowledge. Memory is derived, source-linked knowledge
that may be revised when its evidence changes.

## Workflow

- Before implementation, decompose the work in `.dev/todo/` into independently verifiable items. Each item should map to one cohesive, reviewable, revertible commit.
- For behavior changes, use TDD: write the test, run it and confirm it fails for the intended reason, implement the minimum change, then run the relevant tests and confirm they pass.
- Commit each completed TODO after verification. Never mix unrelated work or commit with failing relevant tests.
- Record detailed task-relevant dialogue output, implementation work, failed attempts, verification, constraints, and decision inputs in context. Never shrink existing context. Before deleting the final TODO, move decisions and design to an ADR or DesignDoc, research facts to research, and preserve the full work evidence in context. Add memory only for confirmed knowledge reusable beyond the current work item. Do not retain the completed plan itself as an archive.
- If TDD is not applicable, record why and the alternative verification in the TODO.

## Control boundary

- Proceed without extra confirmation for inspection, scoped local edits, tests, and planned local commits. Keep them within the requested scope and recoverable through Git.
- Ask before a remote write or publication, a production or shared-environment mutation, an irreversible operation, sending repository-derived material to an unapproved account or service, or materially expanding scope.
- Tool access, a configured remote, an existing pull request, or approval of an earlier action is not approval for a new outward action.
