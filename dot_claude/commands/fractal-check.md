---
description: Run consistency-checker on an existing fractal-reader-style summary directory. Usage: /fractal-check [<dir>]
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
2. Verify each non-skipped layer file (`L1-middleschool.md`, `L2-highschool.md`, `L3-undergrad.md`, `L4-graduate.md`, `L5-original.md`) is present. List any missing and exit if so.
3. Invoke the `consistency-checker` agent with the absolute `<dir>/`.
4. Display its JSON output verbatim.
5. If `ok: false`, suggest `/fractal-regenerate <dir> <layer>` for any layer flagged with a `polarity`, `numeral`, `entity`, or `annotation` issue.

This command does **not** modify any file and does **not** touch git.
