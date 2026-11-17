---
name: responsibility-boundary
description: Implement features or fix defects by splitting responsibilities first, then adding tests only at observable call boundaries. Use for implementation and bug fixes, not review-only or documentation-only work.
---

# Responsibility Boundary

Follow the current request, repository instructions, and client/account restrictions.
Preserve unrelated changes. Do not publish, push, open PRs, or mutate shared environments
without explicit authorization.

## Split first

1. Identify the responsibilities the change touches.
2. Separate call design from implementation design: how callers use the surface, and what
   differs before and after execution.
3. Keep units cohesive around one reason to change. Separate policy from mechanism, I/O from
   judgment, orchestration from detail.
4. Isolate time, randomness, network, and clocks at real boundaries. Do not scatter ad-hoc
   fetches or widen private APIs only for tests.

## Decide whether a contract test is required

Add a test only when a new responsibility boundary appears or an existing boundary's
observable behavior changes. If existing proportionate checks already cover the change, add
neither a new test nor a new tester.

When a test is required:

- Name the expected behavior.
- Assert only results observable from outside the unit.
- Prefer real in-repo collaborators; limit doubles to external or contract boundaries.
- Do not copy implementation constants, structures, or output into expectations.
- Do not require a Red→Green ritual.

## Implement the minimum

Make the smallest change that satisfies the call contract and request. Avoid speculative
abstractions and unrelated cleanup. Handle failures explicitly.

## Finish

Run verification appropriate to the changed boundary and repository contract. Keep artifacts
free of conversation- or edit-process residue. Report what changed, commands and results, and
anything unverified. Persist a handoff only when requested. Do not draft PR titles or bodies;
return bullet material only when asked.
