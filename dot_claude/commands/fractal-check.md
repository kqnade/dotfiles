---
description: Run consistency-checker on an existing fractal summary directory. Usage: /fractal-check [<dir>]
allowed-tools: ["Read", "Bash", "Agent"]
argument-hint: [<dir>]
---

# /fractal-check

Run the `consistency-checker` agent against an existing fractal summary and display its verdict. Read-only.

## Arguments

`$ARGUMENTS`, parsed as up to one positional token:

- The token (if any) is the directory; defaults to `.`.

## Pipeline

1. Verify `<dir>/` exists and contains `meta.json`. Read `meta.json.skipped_layers`.
2. Verify each non-skipped layer file (`L0-essence.md`, `L1-tldr.md`, `L2-summary.md`, `L3-detailed.md`, `L4-original.md`) is present. List any missing and exit if so.
3. Invoke the `consistency-checker` agent with the absolute `<dir>/`.
4. Display its JSON output verbatim.
5. If `ok: false`, suggest `/fractal-regenerate <dir> <layer>` for any layer flagged with a `ratio` or `polarity` issue.

This command does **not** modify any file and does **not** touch git.
