---
name: conversation-context-import
description: >-
  Load saved AI conversation context from `.dev/contexts/` and reconnect it to the
  current TODO, DesignDoc, ADR, research, and Git branch state.
argument-hint: "[optional branch or focus]"
---

# Import conversation context

Resolve the branch and context path with the exact commands below. Stop and ask for an
explicit handoff file if `git symbolic-ref --quiet HEAD` fails on detached HEAD.

```bash
full_ref=$(git symbolic-ref --quiet HEAD)
branch_name=${full_ref#refs/heads/}
readable_slug=$(printf '%s' "$branch_name" | sed 's#[/\\:*?"<>|]#-#g')
ref_hash=$(printf '%s' "$full_ref" | git hash-object --stdin | cut -c1-10)
context_id="${readable_slug}-${ref_hash}"
context_path=".dev/contexts/${context_id}.md"
```

Read `$context_path`.

If the new path does not exist but legacy `.dev/contexts/<readable-slug>.md` does, read the
legacy file and report that it should be migrated by the next export.

Then:

1. Compare its `Source commit` with the current HEAD and flag stale context.
2. Read the relevant active `.dev/todo/` file when one exists. Its absence is valid for
   completed work.
3. Follow only the DesignDoc, ADR, and research links referenced by the context or TODO.
4. Inspect `git status`, branch commits, and the current diff.
5. Check whether decisions, evidence, and current state contradict the canonical `.dev`
   records or repository state.
6. Report the goal, confirmed facts, decisions, completed work, in-flight state, next
   commit-sized TODO, verified gotchas, contradictions, and unverified claims.

If the current branch has no context file, list available context filenames and ask which
one is relevant rather than loading all of them. Do not infer a goal when neither `.dev/`
records nor branch history establishes one. Treat the context as a conversation supplement,
not as authority over TODOs, DesignDocs, ADRs, research, code, or observed test results.
