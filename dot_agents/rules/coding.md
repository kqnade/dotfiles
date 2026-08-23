# Coding

- Follow repository and directory-specific instructions before these personal defaults.
- Make the smallest correct change that satisfies the current requirement. Do not add
  speculative features, premature abstractions, unrelated cleanup, or compatibility that was
  not requested.
- Preserve user-authored and pre-existing changes. Work around unrelated dirty state instead of
  overwriting it.
- Make names and structure explain what the code does. Keep comments to a minimum: add one only
  when the code would otherwise look surprising to a future reader. Do not comment merely to
  explain why ordinary-looking code exists.
- Treat every edited artifact as a self-contained snapshot at its commit. Do not put conversation,
  request, diff, prior-version, or change-process narration in code, comments, documentation, or
  configuration. Git records change history. Artifacts should contain only the current version's
  behavior and audience-facing contracts. Context needed only for future agent work belongs in
  repository workflow state through its authorized owner, not in the artifact. Treat remaining
  residue as blocking: do not approve, commit, or claim completion while it remains.
- Mark intentionally incomplete work, including changes split across pull requests, so future
  readers do not mistake it for finished work. State what remains and include a stable tracking
  reference when one is available.
- Handle failures explicitly. Do not swallow errors, disguise failure as success, or claim a
  fallback worked without verifying it.
