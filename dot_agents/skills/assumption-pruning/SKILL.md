---
name: assumption-pruning
description: Simplify an implementation or design by identifying its load-bearing assumptions, removing them one at a time, and comparing feasible alternatives. Use when the user asks to question premises, reduce accidental complexity, or find a materially simpler approach without losing required behavior.
---

# Assumption Pruning

Find simpler solutions by changing the premise set, not by decorating the
current design with another abstraction.

## Frame the outcome

1. State the observable outcome the system must preserve.
2. Separate explicit user constraints from inferred constraints.
3. Describe the current mechanism and its actual costs: code, state,
   coordination, operations, migration, and failure modes.
4. Mark unknowns. Do not turn convention or old design notes into a hard
   requirement without current evidence.

## Build the assumption inventory

List each premise that makes the current mechanism appear necessary. Include
technical, product, compatibility, operational, and organizational premises.
For each one, record:

- the evidence supporting it;
- what depends on it;
- whether the user or current system actually requires it;
- the cheapest observation that could disprove it.

## Test counterfactuals

Select the most expensive weakly supported premise and **remove one
assumption**. Describe the smallest coherent design that becomes possible.
Repeat independently for the next useful premise; do not remove several at
once and then guess which change mattered.

For every alternative, identify:

- behavior preserved and behavior intentionally dropped;
- components, state, or coordination removed;
- new dependencies and **displaced complexity**;
- migration and rollback requirements;
- evidence or experiment needed before adoption.

Reject an alternative when it merely moves complexity to a less visible
boundary, violates a confirmed constraint, or depends on imaginary future
needs.

## Compare and report

Compare the current design and credible alternatives using the same dimensions:

| Dimension | Question |
|---|---|
| Required behavior | Does it preserve the outcome and explicit constraints? |
| Total complexity | What code, state, coordination, and operations remain? |
| Failure surface | Which failures disappear, move, or appear? |
| Evidence | Which claims are observed, inferred, or unverified? |
| Change cost | What migration, compatibility, and rollback work is required? |

Recommend one of: adopt now, validate with a bounded experiment, keep the
current design, or revisit after a named constraint changes. Show the premise
whose removal creates the recommendation and the evidence that would reverse
it. Do not implement the alternative unless the user also requested a change.
When an accepted alternative changes executable behavior, hand implementation
to `test-driven-development` with the preserved outcome and confirmed
constraints.
