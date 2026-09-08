# Git workflow

- This personal coding account must not inspect or modify repositories whose GitHub remote owner is
  `livesense-inc` or `jobtalk`. Stop immediately and use the approved Claude account instead.
- For authorized implementation, make each commit one cohesive, reviewable, and revertible Green
  increment. Commit a completed TDD behavior before starting the next increment; never commit a
  known Red state.
- Stage only the paths or hunks belonging to the increment. Inspect `git status`, the staged diff,
  and relevant test results before committing. Preserve unrelated user changes.
- Use `git cc` for normal local commits. It routes validated GitHub remotes owned by `livesense-inc`
  or `jobtalk` to the approved Claude backend and other validated GitHub remotes to the no-tools Pi
  Sol backend. The selected backend generates a gitmoji conventional message from the staged diff
  and recent history, then `git cc` performs the commit.
- `git cc` rejects malformed or unsupported GitHub remotes, or conflicting repository identities
  after Git URL rewriting, before reading the staged diff or recent history; it must not fall back
  to another backend or model.
- If `git cc` is unavailable or rejected, report the reason and generate the same gitmoji
  conventional message style in the current coding session before using `git commit -m` as a local
  fallback.
- Treat push, pull-request creation or editing, and every other remote mutation as separate from a
  local commit and require explicit authorization.
