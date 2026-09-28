# Dependency Update Review

Apply only to the dependency delta under review.

- Compare the manifest and lockfile. Explain material transitive changes,
  source/checksum changes, new build scripts, native components, runtime floors,
  and license changes covered by repository policy. Explained does not mean safe.
- Read primary release notes, migration guidance, and security advisories for
  the relevant versions. Check actual repository uses of affected APIs and
  platform features. Treat unavailable evidence as unknown, not as reassurance.
- Run the ecosystem's locked or frozen consistency check. If resolver churn,
  lockfile format changes, or unexplained package movement affects the verdict,
  reproduce resolution in an authorized isolated workspace, not the user's files.
- Derive test coverage from the affected platforms and runtime boundaries.
  Distinguish local results, CI tied to the reviewed head, and untested targets.
  Identify missing evidence that prevents a positive conclusion; do not demand
  unrelated platforms or treat skipped CI as passed.

Report material findings and verification gaps through the main review. This
checklist does not authorize installs, network access, or lockfile changes.
