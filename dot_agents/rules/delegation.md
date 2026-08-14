# Codex delegation

- Keep the primary agent focused on requirements, decisions, coordination, and final verification.
- Delegate independent, bounded work when doing so materially reduces main-thread work or latency.
  Prefer Luna for clear, repeatable, or high-volume tasks such as read-heavy exploration, targeted
  searches, test execution, log analysis, and summarization.
- When a task is likely to span multiple independent areas, delegate it to `luna_parallelizer` so
  one Luna coordinator can perform shallow discovery, split disjoint packets, and fan them out to
  Luna workers. Keep the primary agent out of duplicate discovery and wait for the coordinator's
  verified summary.
- Run independent read-only tasks in parallel. Give each subagent one bounded deliverable and only
  the context it needs, then verify and synthesize its result in the primary thread.
- Keep trivial or strictly sequential work in the primary thread when delegation overhead would
  outweigh the benefit. Serialize overlapping writes and do not assign duplicate investigations.
