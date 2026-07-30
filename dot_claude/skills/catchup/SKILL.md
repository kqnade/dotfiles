---
name: catchup
description: >-
  Rebuild working context after a fresh session or compaction from `.dev/todo/`,
  `.dev/contexts/`, linked design records, and the current Git branch. Read-only.
argument-hint: "[optional focus]"
disable-model-invocation: true
---

# Catch up

Read only; never modify the worktree.

1. Resolve the full branch ref with `git symbolic-ref --quiet HEAD` and run `git status`.
   Stop and ask for an explicit handoff file on detached HEAD.
2. Read any relevant active work item in `.dev/todo/`. The absence of a work item means
   there is no recorded in-flight plan; do not treat it as missing history. Derive the
   context path exactly:

```bash
full_ref=$(git symbolic-ref --quiet HEAD)
branch_name=${full_ref#refs/heads/}
readable_slug=$(printf '%s' "$branch_name" | sed 's#[/\\:*?"<>|]#-#g')
ref_hash=$(printf '%s' "$full_ref" | git hash-object --stdin | cut -c1-10)
context_id="${readable_slug}-${ref_hash}"
context_path=".dev/contexts/${context_id}.md"
```

3. Read `$context_path` when it exists.
4. Follow only linked files in `.dev/designdoc/`, `.dev/adr/`, and `.dev/research/`.
5. Inspect branch commits and changed hunks, prioritizing `$ARGUMENTS` when supplied.
6. Summarize:

```markdown
## Catchup: <branch>

- Goal:
- Done:
- In flight:
- Next:
- Evidence and gotchas:
```

Treat `.dev/` as authoritative for intent and Git as authoritative for implemented state.
Call out disagreement between them instead of silently choosing one. Use
`/conversation-context-export` to save detailed work context. Do not read an unrelated
branch context as memory; use `project-memory` for reusable repository knowledge.
