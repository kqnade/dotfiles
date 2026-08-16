# Codex delegation

- Keep the primary agent focused on requirements, decisions, coordination, and final verification.
- Delegate independent, bounded work when doing so materially reduces main-thread work or latency.
- Keep Luna as the default subagent for general delegated work. Prefer Luna for read-heavy
  exploration, multi-file analysis, and work that needs judgment beyond a mechanical execution
  packet.
- Prefer `spark_worker` for bounded, low-ambiguity work with explicit ownership, expected output,
  and verification. Good fits include mechanical or repetitive edits, scoped renames or formatting,
  targeted searches, test execution or log analysis, focused summaries, and granular UI
  adjustments whose desired result is already defined.
- Keep requirements, architecture, security-sensitive judgment, ambiguous diagnosis, and final
  verification with Luna or the primary agent. If Spark finds missing requirements, unexpected
  failures, or a cross-boundary semantic tradeoff, return the packet to Luna or the primary agent.
- Treat an implementation as large only when both of the following are true: it spans multiple
  independently verifiable and committable features, and those features can be implemented
  concurrently in isolated worktrees. `route-large-implementation` owns large implementations and
  takes priority over this rule. Do not delegate them to `luna_parallelizer`.
- When a non-large task is likely to span multiple independent areas, delegate it to
  `luna_parallelizer` so one Luna coordinator can perform shallow discovery, split disjoint
  packets, and fan them out to model-fit workers. Keep the primary agent out of duplicate discovery
  and wait for the coordinator's verified summary.
- Run independent read-only tasks in parallel. Give each subagent one bounded deliverable and only
  the context it needs, then verify and synthesize its result in the primary thread.
- Keep trivial or strictly sequential work in the primary thread when delegation overhead would
  outweigh the benefit. Serialize overlapping writes and do not assign duplicate investigations.
