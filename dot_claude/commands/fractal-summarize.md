---
description: Generate 5-layer fractal summary (L0-L4) for a document. Usage: /fractal-summarize <path-or-url> [--output-dir <dir>]
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent"]
argument-hint: <path-or-url> [--output-dir <dir>]
---

# /fractal-summarize

Run the full fractal summarization pipeline on the given input.

## Arguments

User-supplied: `$ARGUMENTS`

Parse as: `<path-or-url> [--output-dir <dir>]`

- **`<path-or-url>`** (required): one of
  - a path to a `.pdf`, `.md`, or `.txt` file (absolute or relative to CWD)
  - an `http(s)://` URL
- **`--output-dir <dir>`** (optional, default `./docs`): where to create `<slug>/` underneath. Resolved relative to CWD.

## Pipeline

Execute these steps in order. If any step fails, stop and report.

### Step 1 — Preflight: verify external tools

Based on the input type, check tools exist via `which`. **Do not silently fall back.**

- **PDF input**: requires `pdftotext`. If missing, print:
  ```
  pdftotext (poppler) is required for PDF input. Install:
    macOS:    brew install poppler
    Arch:     sudo pacman -S poppler
    Debian:   sudo apt install poppler-utils
  ```
  and exit.

- **URL input**: requires Node.js (`node`) for `npx defuddle`. If `node` is missing:
  ```
  Node.js is required for URL extraction (via `npx defuddle`). Install:
    macOS:    brew install node
    Arch:     sudo pacman -S nodejs npm
    Debian:   sudo apt install nodejs npm
  ```
  Then exit.
  (`defuddle` itself is fetched on demand by `npx -y`, no global install needed.)

- **Markdown / plain text input**: no external tool needed.

### Step 2 — Normalize input → L4

Resolve `<output-dir>` to an absolute path. Determine `<slug>`:

- For files: derive from the file's title (first H1 if present, else filename without extension), kebab-cased.
- For URLs: derive from the page title once fetched (or the URL host + last path segment as a fallback).
- If `<output-dir>/<slug>/` already exists, suffix `-2`, `-3`, … until unique.

Create `<output-dir>/<slug>/` and populate `L4-original.md`:

- **PDF**: `pdftotext -layout <input.pdf> -` (stdout) → write to `L4-original.md`.
- **URL**: `npx -y defuddle parse <url> --markdown` → write to `L4-original.md`.
- **Markdown / text**: copy as-is.

Strip BOM and normalize line endings to LF.

### Step 3 — Initialize meta.json

Write `<output-dir>/<slug>/meta.json`:

```json
{
  "doc_slug": "<slug>",
  "title": "<extracted title or filename>",
  "source": { "type": "pdf|md|txt|url", "path_or_url": "<input>" },
  "created_at": "<ISO-8601>",
  "last_regenerated": {}
}
```

### Step 4 — Generate layers (sequential, top-down on dependency order)

Each step delegates to the named subagent via the Agent tool. Pass the absolute path of `<output-dir>/<slug>/` so the agent has unambiguous context.

1. Invoke `summarizer-L3` → `L3-detailed.md`. Update `meta.json.last_regenerated.L3`.
2. Invoke `summarizer-L2` → `L2-summary.md`. Update `meta.json.last_regenerated.L2`.
3. Invoke `summarizer-L1` → `L1-tldr.md`. Update `meta.json.last_regenerated.L1`.
4. Invoke `summarizer-L0` → `L0-essence.md`. Update `meta.json.last_regenerated.L0`.

**Length retry**: if a subagent reports actual chars outside ±30% of target, re-invoke once with a "you were N chars off, please retry within tolerance" addendum. If it still fails, log a warning and continue.

**Edge case — very short input** (L4 < 500 chars): skip L3 and have `summarizer-L2` read directly from L4. Note this in `meta.json` as `"l3_skipped": true`.

**Edge case — very long input** (L4 > 50k tokens / >100k chars): pass a hint to `summarizer-L3` to chunk by chapter. The agent already knows how to handle this.

### Step 5 — Anchors and consistency check (parallel)

After L3 is written, the following two are independent and may run in parallel:

- Invoke `anchor-mapper` → `anchors.json`.

After all layers (L0-L3) are written:

- Invoke `consistency-checker`. Capture its stdout (the JSON verdict) and display it to the user.

### Step 6 — Stage but do not commit

Run:

```bash
git add <output-dir>/<slug>/
```

…only if CWD is inside a git repo. If not, skip silently.

**Do not run `git commit`.** Show the user the resulting tree:

```
docs/<slug>/
├── L0-essence.md     (NN chars)
├── L1-tldr.md        (NN chars)
├── L2-summary.md     (NN chars)
├── L3-detailed.md    (NN chars, M sections)
├── L4-original.md    (NN chars)
├── anchors.json      (M anchors)
└── meta.json
```

Followed by the consistency-checker JSON verdict.

## Notes

- URL extractor choice: **defuddle**. Reason: actively maintained in 2026, multi-pass extraction (more robust than Mozilla Readability on modern sites), standardizes math/code/footnotes which downstream layers benefit from. Rust ports either embed a JS engine or are less feature-complete; via `npx -y` defuddle needs no global install.
- This command never commits. Inspect with `git diff --staged` and commit yourself when satisfied.
