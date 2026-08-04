# Verification

- Route executable behavior changes through the installed `using-workflow-skills` and
  `test-driven-development` skills.
- Work in one observable List -> Red -> Green -> Refactor increment at a time. Confirm that Red
  fails for the intended reason and that relevant tests return to Green after implementation and
  refactoring.
- Test public behavior with real collaborators where practical. Mock only genuine slow,
  nondeterministic, or external boundaries.
- Never describe an unrun check as passing. Report skipped checks, limitations, and remaining
  uncertainty explicitly.
- Keep observed facts, inferences, and decisions distinguishable. Verify material claims against
  code, tests, command output, or current primary sources.
