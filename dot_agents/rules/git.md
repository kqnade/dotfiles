# Git workflow

- This Codex account must not inspect or modify repositories whose GitHub remote owner is
  `livesense-inc` or `jobtalk`. Stop immediately and use the approved Claude account instead.
- For authorized implementation, make each commit one cohesive, reviewable, and revertible Green
  increment. Commit a completed TDD behavior before starting the next increment; never commit a
  known Red state.
- Stage only the paths or hunks belonging to the increment. Inspect `git status`, the staged diff,
  and relevant test results before committing. Preserve unrelated user changes.
- Use `git cc` for normal local commits. It reads the staged diff and recent history, generates a
  gitmoji conventional message with Luna, and performs the commit.
- If `git cc` is unavailable or rejected, report the reason and generate the same style of message
  in the current Codex session before using `git commit -m` as a local fallback.
- Treat push, pull-request creation or editing, and every other remote mutation as separate from a
  local commit and require explicit authorization.
