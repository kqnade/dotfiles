# Delivery

- When a repository uses PRD and STD artifacts, treat PRD, STD, and implementation as separate
  review units and separate pull requests unless repository instructions explicitly say otherwise.
- The PRD defines what to solve and why: goals, non-goals, scope, constraints, and acceptance
  criteria. Keep implementation design out of it.
- Write the STD after the PRD is accepted. The STD defines how to implement the accepted
  requirement, including interfaces, alternatives, risks, migration, and verification.
- Start implementation after the STD is accepted. Split implementation further when each part can
  be independently reviewed, verified, and reverted.
- Planning separate pull requests does not authorize creating, editing, or publishing them. Remote
  operations still require an explicit request.
