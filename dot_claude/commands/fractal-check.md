---
description: Run the consistency-checker agent on an existing fractal summary. Usage: /fractal-check <slug> [--output-dir <dir>]
allowed-tools: ["Read", "Bash", "Agent"]
argument-hint: <slug> [--output-dir <dir>]
---

# /fractal-check

Run the `consistency-checker` agent against an existing fractal summary and display its verdict.

## Arguments

User-supplied: `$ARGUMENTS`

Parse as: `<slug> [--output-dir <dir>]`

- **`<slug>`** (required): the directory name under `<output-dir>/`.
- **`--output-dir <dir>`** (optional, default `./docs`): resolved relative to CWD.

## Pipeline

1. Verify `<output-dir>/<slug>/` exists and contains `L0-essence.md`, `L1-tldr.md`, `L2-summary.md`, `L3-detailed.md`, `L4-original.md`. If any is missing, list which ones and exit.
2. Invoke the `consistency-checker` agent with the absolute path of `<output-dir>/<slug>/`.
3. Display its JSON output verbatim to the user.
4. If `ok: false`, suggest `/fractal-regenerate <slug> <layer>` for any layer flagged with a `length` or `polarity` issue.

This command does **not** modify any file and does **not** touch git.
