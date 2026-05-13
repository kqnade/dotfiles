---
description: Regenerate the downstream (simpler-reader) layers of an existing fractal-reader-style summary after editing one by hand. Usage: /fractal-regenerate [<dir>] <layer>
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent"]
argument-hint: [<dir>] <L1|L2|L3|L4>
---

# /fractal-regenerate

Cascade regeneration after a manual edit. The named layer is the one **you just edited**; every simpler-reader layer below it (smaller `L` number) is regenerated from your edit.

See `/fractal-summarize` for the full design and pipeline. This command is the partial-regeneration entry point.

## Layer numbering recap

L5 is the original (largest); L1 is the simplest (middle-school rewrite). Edits cascade **downward** in the reader profile: editing L4 (Graduate) cascades into L3 → L2 → L1 (each becomes a re-rewrite of the new L4 for its respective reader). Editing L1 has nowhere to cascade.

## Arguments

`$ARGUMENTS`, parsed as up to two positional tokens:

- The token matching `^L[1-4]$` is the layer name.
- The other token (if any) is the directory; defaults to `.`.

```
/fractal-regenerate L3              # CWD, edited L3
/fractal-regenerate ~/papers/x L3   # ~/papers/x, edited L3
```

## Pipeline

### Step 1 — Verify the directory

`<dir>/` must exist and contain at least `L5-original.md` and `meta.json`. If not, point the user at `/fractal-summarize`.

### Step 2 — Determine the regeneration chain

The layer you edited is left untouched. Everything **simpler** (smaller `L` number) is regenerated. Layers listed in `meta.json.skipped_layers` stay skipped — they are not re-introduced.

| Edited layer | Cascade (in order) | Re-run `anchor-mapper`? |
|--------------|--------------------|--------------------------|
| L4           | L3 → L2 → L1       | yes                      |
| L3           | L2 → L1            | yes                      |
| L2           | L1                 | yes                      |
| L1           | (nothing)          | no                       |

For `/fractal-regenerate L1`: print "nothing downstream of L1" and exit.

### Step 3 — Regenerate

Read `meta.json.summary_language` (default `ja` if missing) — this is passed to every summarizer so re-generated layers stay in the same language as the original run.

For each layer in the cascade, in order:

1. If the layer is in `meta.json.skipped_layers`, skip it (do not regenerate).
2. Determine the parent: the closest non-skipped layer with a higher `L` number than the current one (falling back to L5 if all intervening layers are skipped).
3. Invoke the corresponding `summarizer-L<n>` agent with the absolute `<dir>/`, the parent layer name, and `summary_language`.
4. Update `meta.json.last_regenerated.L<n>` to the current ISO-8601 timestamp.

The new `parent_hash` in each regenerated file's frontmatter automatically reflects the new content of its source layer.

### Step 4 — Anchors

If at least one of L4 / L3 / L2 was regenerated and is not in `skipped_layers`, invoke `anchor-mapper`.

### Step 5 — Consistency check

Always invoke `consistency-checker` after regeneration. Display its JSON stdout.

### Step 6 — Stage but do not commit

```bash
git add <dir>/
```

…only inside a git repo. **Never commit.**

Print a short summary of which files changed plus the consistency verdict.
