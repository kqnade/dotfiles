---
description: Regenerate a layer (and all its upstream layers) of an existing fractal summary. Usage: /fractal-regenerate <slug> <layer> [--output-dir <dir>]
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent"]
argument-hint: <slug> <L0|L1|L2|L3> [--output-dir <dir>]
---

# /fractal-regenerate

Regenerate a specific layer of an existing fractal summary, then cascade to all upstream (more-compressed) layers.

## Arguments

User-supplied: `$ARGUMENTS`

Parse as: `<slug> <layer> [--output-dir <dir>]`

- **`<slug>`** (required): the directory name under `<output-dir>/`.
- **`<layer>`** (required): one of `L0`, `L1`, `L2`, `L3`. (You cannot regenerate `L4` — that is the source of truth.)
- **`--output-dir <dir>`** (optional, default `./docs`): resolved relative to CWD.

## Pipeline

### Step 1 — Verify the directory exists

`<output-dir>/<slug>/` must exist and contain at least `L4-original.md` and `meta.json`. If not, print an error pointing the user to `/fractal-summarize` for first-time generation.

### Step 2 — Determine the regeneration chain

The `<layer>` argument names the layer the user **just edited by hand**. That layer is left untouched. Everything **upstream** (more compressed; smaller `L` number) is regenerated, because each upstream layer derives from the one below it.

| User edited | Regenerate (in this order) | Re-run `anchor-mapper`? |
|-------------|----------------------------|-------------------------|
| L3          | L2 → L1 → L0               | yes                     |
| L2          | L1 → L0                    | no                      |
| L1          | L0                         | no                      |
| L0          | (nothing)                  | no                      |

For `/fractal-regenerate <slug> L0`, print a message that there is nothing upstream to regenerate and exit.

### Step 3 — Regenerate

For each layer in the chain, invoke the corresponding `summarizer-L<n>` agent with the absolute path of `<output-dir>/<slug>/`. Then update `meta.json.last_regenerated.L<n>` to the current ISO-8601 timestamp. Do **not** overwrite the user's edited layer.

### Step 4 — Anchors

If L3 was regenerated, invoke `anchor-mapper` after L3 is written.

### Step 5 — Consistency check

Always run `consistency-checker` after regeneration. Display its JSON output.

### Step 6 — Stage but do not commit

```bash
git add <output-dir>/<slug>/
```

Only inside a git repo. Do **not** commit.

Print a short summary of which files changed and the consistency verdict.
