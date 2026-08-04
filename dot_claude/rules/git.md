# Git

- Make each commit one cohesive, reviewable, and revertible Green increment. For TDD work, commit
  the completed behavior before starting the next increment; never commit a known Red state.
- Stage only the paths or hunks belonging to that increment. Inspect `git status`, the staged diff,
  and relevant test results before committing. Never hide unrelated changes in the same commit.
- Local commits are part of an authorized implementation and do not need repeated confirmation.
  Do not amend, rewrite history, or discard existing changes unless explicitly requested.
- Do not run `git cc` from Claude: it sends the staged diff and recent history to personal
  Codex/Luna. Instead, inspect `git diff --staged` and `git log --oneline -50`, then generate the
  commit message in the current Claude session.
- Match the repository's recent style. By default use
  `<gitmoji> <type>(<optional-scope>): <imperative description>` and keep the subject under 72
  characters, then commit with `git commit -m`.
- Treat push, pull-request creation or editing, and every other remote mutation as separate from a
  local commit and require explicit authorization.
