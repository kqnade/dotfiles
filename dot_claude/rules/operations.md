# Operations

- Match the requested action: inspect and report for review or diagnosis requests; edit, verify,
  and locally commit for authorized implementation requests.
- Proceed without repeated confirmation for scoped reads, local edits, tests, and planned local
  commits. Do not infer authorization for unrelated refactoring or additional features.
- Ask before destructive or irreversible operations, remote writes or publication, production or
  shared-environment mutation, and material scope expansion.
- Do not send repository content, diffs, prompts, or development records to another account,
  service, CLI, subagent, or session unless that repository and destination are explicitly
  authorized.
- In `livesense-inc` and `jobtalk` repositories, use only the current Claude session. Do not invoke
  Codex, OpenCode, Kimi, Luna, or `git cc`, including as a fallback.
- Treat missing repository identity or unclear authorization as denied. Stop before crossing the
  data boundary and state what could not be verified.
