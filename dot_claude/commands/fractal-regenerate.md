---
description: Regenerate the upstream (more-compressed) layers of an existing fractal summary after editing one by hand. Usage: /fractal-regenerate [<dir>] <layer>
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent"]
argument-hint: [<dir>] <L0|L1|L2|L3>
---

# /fractal-regenerate

Cascade regeneration after a manual edit. The named layer is the one **you just edited**; every more-compressed layer above it is regenerated from your edit.

See `/fractal-summarize` for the full design and pipeline. This command is the partial-regeneration entry point.

## Arguments

`$ARGUMENTS`, parsed as up to two positional tokens:

- The token matching `^L[0-3]$` is the layer name.
- The other token (if any) is the directory; defaults to `.`.

```
/fractal-regenerate L2              # CWD, edited L2
/fractal-regenerate ~/papers/x L2   # ~/papers/x, edited L2
```

## Pipeline

### Step 1 — Verify the directory

`<dir>/` must exist and contain at least `L4-original.md` and `meta.json`. If not, point the user at `/fractal-summarize`.

### Step 2 — Determine the regeneration chain

The layer you edited is left untouched. Everything more compressed (smaller `L` number) is regenerated. Layers listed in `meta.json.skipped_layers` stay skipped — they are not re-introduced.

| Edited layer | Cascade (in order) | Re-run `anchor-mapper`? |
|--------------|--------------------|-------------------------|
| L3           | L2 → L1 → L0       | yes                     |
| L2           | L1 → L0            | no                      |
| L1           | L0                 | no                      |
| L0           | (nothing)          | no                      |

For `/fractal-regenerate L0`: print "nothing upstream of L0" and exit.

### Step 3 — Regenerate

Read `meta.json.summary_language` (default `ja` if missing) — this is passed to every summarizer so re-generated layers stay in the same language as the original run.

For each layer in the cascade, in order:

1. If the layer is in `meta.json.skipped_layers`, skip it (do not regenerate).
2. Determine the parent: the closest non-skipped layer below the current one (`L4` if all intervening layers are skipped).
3. Invoke the corresponding `summarizer-L<n>` agent with the absolute `<dir>/`, the parent layer name, and `summary_language`.
4. Update `meta.json.last_regenerated.L<n>` to the current ISO-8601 timestamp.

The new `parent_hash` in each regenerated file's frontmatter automatically reflects the new content of its source layer.

### Step 4 — Anchors

If L3 was in the cascade and is **not** in `skipped_layers`, invoke `anchor-mapper`.

### Step 5 — Consistency check

Always invoke `consistency-checker` after regeneration. Display its JSON stdout.

### Step 6 — Stage but do not commit

```bash
git add <dir>/
```

…only inside a git repo. **Never commit.**

Print a short summary of which files changed plus the consistency verdict.
