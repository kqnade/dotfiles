---
name: test-driven-development
description: Use when changing executable behavior or fixing a defect. Drive development with a behavior test list and one verified List → Red → Green → Refactor cycle at a time; do not use for documentation-only or mechanically generated changes.
---

# Test-Driven Development

Develop behavior through short feedback loops. Treat TDD as a programming workflow, not as a synonym for automated tests or for writing all tests before implementation.

The canonical cycle is:

> List → Red → Green → Refactor → repeat

The intended end state is:

- Existing behavior still works.
- New behavior works as expected.
- The design is ready for the next change.
- Fresh evidence supports those claims.

## 1. Build the test list

Before writing test or production code, list the behavior examples that matter. Include normal cases, boundaries, failures, and regressions that the change could cause.

Write observable behavior, not implementation steps. Keep sketches of implementation separate from the test list.

Order the list so the next example gives useful design feedback with the smallest step. The list is live: add a newly discovered behavior immediately, but do not turn every item into test code up front.

If the change is documentation-only, generated code, or configuration with no practical executable seam, say that TDD does not apply. Identify a proportionate deterministic verification instead; do not pretend that a post-hoc check is TDD.

## 2. Red: translate exactly one example

Choose exactly one item from the test list. Write one concrete automated test with setup, execution, and a meaningful assertion. Prefer starting from the assertion when that clarifies the interface.

Run the narrowest command that executes the new test and observe it fail for the expected reason.

- If it passes, the behavior may already exist or the test may not exercise it. Investigate before proceeding.
- If it errors or fails for an unrelated reason, fix the test or fixture until the failure demonstrates the missing behavior.
- Never weaken or remove the assertion to obtain Green.
- Never copy the current implementation output into the expected value without independently deriving that expectation.

Record the command and the relevant failure. A test file alone is not evidence of Red.

## 3. Green: make only this example pass

Change production code only enough to satisfy the one failing example. Run the new test and the relevant existing tests.

All tests must be green before moving on. Do not mix cleanup, speculative abstractions, unrelated fixes, or the next test-list item into this step.

When implementation reveals another behavior, add it to the test list. If the discovery invalidates the current direction, prefer restarting the small cycle with a better first example over defending sunk work.

Mark the selected test-list item complete only after the expected behavior and relevant regression suite pass.

## 4. Refactor while green

With tests green, improve names, structure, duplication, and interfaces only where current evidence supports the change. Keep behavior unchanged and rerun the relevant tests after each refactoring step.

Duplication is a signal to examine, not an automatic order to abstract. Avoid making the design more general than the examples require.

## 5. Repeat and finish

Return to the test list and select exactly one next example. Repeat Red, Green, and Refactor until the behavior list is empty or the user changes scope.

Before claiming completion:

1. Run the full verification appropriate to the changed behavior.
2. Confirm every test-list item is complete or explicitly out of scope.
3. Separate verified facts from inference and skipped checks.
4. Follow the repository's documented completion checks before reporting the
   result.

## Test quality

Prefer tests that demonstrate public behavior with real collaborators where
practical. Use a test double only at a genuine boundary that is slow,
nondeterministic, or outside the test's control. Assert meaningful outputs or
state changes rather than mock interactions or test-only implementation
details. A test should fail when the promised behavior breaks, not merely when
the implementation is rearranged.

## Source fidelity

This workflow follows the TDD definition translated and explained by Takuto Wada: begin with a test list, translate one item into one executable failing test, make all tests pass, refactor if needed, and repeat. It intentionally replaces the narrower “test first” caricature.
