---
description: Generate a 5-layer fractal summary in the current (or specified) directory. Each layer compresses the previous one to ~30-40%. Usage: /fractal-summarize [<dir>|<url>] [<dir>]
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent"]
argument-hint: [<dir>|<url>] [<dir>]
---

# /fractal-summarize

Run the full fractal summarization pipeline on a document. The output directory **is** the input directory — there is no `slug` and no nested `docs/` folder.

## Design philosophy

Each layer compresses its parent to roughly **one-third** (target band: 30〜40%). Absolute character counts therefore scale with the source: a 30-page paper produces a longer L3 than a 1-page note, but the **density gradient between layers is constant**. That is what "fractal" means here — zoom out one step and the summary stays one-third the size, regardless of where you started.

When a layer would fall below an 80-character floor, that layer is skipped and the next layer is generated from the most recent surviving parent. This keeps short documents from collapsing into pseudo-summaries that are indistinguishable from each other.

## Arguments

User-supplied: `$ARGUMENTS`. Parse as up to two positional args:

| Form                                   | Behavior                                       |
|----------------------------------------|------------------------------------------------|
| (none)                                 | summarize source file in CWD                   |
| `<dir>`                                | summarize source file in `<dir>`               |
| `<url>`                                | fetch URL into CWD, then summarize             |
| `<url> <dir>`                          | fetch URL into `<dir>`, then summarize         |

A token is a URL iff it starts with `http://` or `https://`.

## Pipeline

### Step 1 — Resolve target directory

- 0 or 1 non-URL arg → that arg (or `.`) becomes `<dir>`.
- URL + optional dir → that dir (or `.`) becomes `<dir>`. URL fetch happens in Step 2.

Resolve `<dir>` to an absolute path and `mkdir -p` it.

### Step 2 — URL fetch (URL mode only)

Skip this step if no URL was given.

1. Verify external tools (see Preflight below).
2. Reject if `<dir>` already contains any source-candidate file (see Step 3 detection rule). Print which file blocks the fetch and exit; ask the user to delete it manually.
3. Run `curl -sSL --max-time 60 -o <tmpfile> -D <headersfile> <url>`. On non-2xx, missing body, or timeout: delete tmpfile and exit with the HTTP status.
4. Determine save filename:
   - Strip query/fragment from the **final** redirected URL, take the last path segment.
   - If that segment has a recognized extension (`.pdf|.md|.html|.htm|.txt`), use it verbatim.
   - Otherwise fall back to Content-Type:
     - `application/pdf` → `source.pdf`
     - `text/html` → `source.html`
     - `text/markdown` → `source.md`
     - `text/plain` → `source-content.txt` (avoid clashing with `source.txt`)
     - anything else → exit, print Content-Type.
5. Move tmpfile to `<dir>/<filename>`.
6. Write `<dir>/source.txt` containing the **original** URL on one line. If `source.txt` exists, do **not** overwrite — just warn.

### Step 3 — Detect the source file

List `<dir>` and exclude generated artifacts:

```
L0-essence.md  L1-tldr.md  L2-summary.md  L3-detailed.md
L4-original.md  anchors.json  meta.json  source.txt
```

Of what remains, keep files with a supported extension: `.pdf`, `.md`, `.txt`, `.html`, `.htm`.

- 0 candidates → exit with "no source file found in `<dir>`"
- 2+ candidates → exit listing the conflicting files; ask the user to remove all but one
- 1 unsupported-extension file in addition → exit naming the unsupported extension
- exactly 1 supported candidate → that is the source file

### Step 4 — Preflight: external tools

Check via `which` based on the source file's extension. **Do not silently fall back.**

| Extension       | Tool        | Install hint on missing                                                                            |
|-----------------|-------------|----------------------------------------------------------------------------------------------------|
| `.pdf`          | `pdftotext` | `brew install poppler` / `pacman -S poppler` / `apt install poppler-utils`                         |
| `.html`/`.htm`  | `node`      | `brew install node` / `pacman -S nodejs npm` / `apt install nodejs npm` (defuddle fetched via npx) |
| `.md` / `.txt`  | (none)      |                                                                                                    |

URL mode additionally needs `curl`.

### Step 5 — Generate `L4-original.md`

Extract to plain Markdown:

- `.pdf` → `pdftotext -layout <file> -` (stdout)
- `.html`/`.htm` → `npx -y defuddle parse <file> --markdown`
- `.md` → copy body verbatim
- `.txt` → wrap body verbatim

Strip BOM, normalize line endings to LF, then write `<dir>/L4-original.md` with this frontmatter:

```yaml
---
layer: L4
source_file: <basename of the source file>
extracted_with: pdftotext-layout|defuddle|copy
actual_chars: <wc -m of body>
generated_at: <ISO-8601 with timezone>
---
```

### Step 6 — Initialize `meta.json`

```json
{
  "title": "<H1 from L4 if present, else source basename without extension>",
  "source": {
    "type": "pdf|md|html|txt",
    "file": "<basename of the source file>",
    "path_or_url": "<URL from source.txt if URL mode, else ./<basename>>"
  },
  "language": "<source language; default 'ja'>",
  "created_at": "<ISO-8601 with timezone>",
  "last_regenerated": {},
  "skipped_layers": [],
  "anchors_skipped": false
}
```

### Step 7 — Layer cascade with pre-flight skip judgment

Maintain a variable `last_present_layer = "L4"` and `last_present_chars = <L4 actual_chars>`.

For each layer in `[L3, L2, L1]` (in order):

1. If `last_present_chars * 0.30 < 80`:
   - Append the layer to `meta.json.skipped_layers`.
   - Do **not** invoke its summarizer.
   - Move on (last_present_* unchanged).
2. Otherwise:
   - Invoke the corresponding `summarizer-L<n>` agent via the Agent tool, passing:
     - the absolute path of `<dir>/`
     - the parent layer name (= `last_present_layer`)
   - Wait for completion.
   - Read the new file's `actual_chars` from its frontmatter.
   - Update `last_present_layer = "L<n>"`, `last_present_chars = <new actual_chars>`.
   - Update `meta.json.last_regenerated.L<n>` to now.

Then for `L0`:

- Always invoke `summarizer-L0`, passing the parent layer name (= `last_present_layer`).
- Update `meta.json.last_regenerated.L0`.

If the orchestrator detects that a summarizer's reported `actual_ratio` falls outside `[0.25, 0.45]` after the agent's own retries, log a warning to the user but keep the file.

### Step 8 — Anchors and consistency check

If `L3` is **not** in `skipped_layers`, invoke `anchor-mapper`. Otherwise set `meta.json.anchors_skipped = true` and skip.

`anchor-mapper` and `consistency-checker` may run in parallel (independent inputs).

Invoke `consistency-checker` regardless. Capture its stdout JSON and display it to the user verbatim.

### Step 9 — Stage but do not commit

If CWD (or `<dir>`) is inside a git repo:

```bash
git add <dir>/
```

Otherwise skip silently. **Never commit.**

Display a tree summary:

```
<dir>/
├── <source-basename>      (original)
├── source.txt             (URL mode only)
├── L4-original.md         (NN chars)
├── L3-detailed.md         (NN chars, ratio 0.34)
├── L2-summary.md          (NN chars, ratio 0.36)
├── L1-tldr.md             (NN chars, ratio 0.33)
├── L0-essence.md          (NN chars)
├── anchors.json           (M anchors)   [omitted if anchors_skipped]
└── meta.json
```

Followed by the consistency-checker JSON verdict.

## HTML extraction tool — selection rationale

**defuddle** (kepano, Obsidian Web Clipper origin) is used via `npx -y defuddle parse <file> --markdown`. Reasons: actively maintained in 2026; multi-pass extraction adapts where Mozilla Readability gives up on modern sites; standardizes math, code, and footnotes — friendly to downstream summarization. Rust ports either embed a JS engine or are less feature-complete; via `npx` defuddle needs no global install.

## Usage examples

```bash
# Pattern 1 — fetch URL directly
mkdir ~/papers/attention && cd ~/papers/attention
claude
> /fractal-summarize https://arxiv.org/pdf/1706.03762

# Pattern 2 — drop a file in first
mkdir ~/papers/foo && cd ~/papers/foo
cp ~/Downloads/paper.pdf ./
claude
> /fractal-summarize

# Pattern 3 — Markdown straight in
mkdir ~/notes/article && cd ~/notes/article
# place article.md in ./
claude
> /fractal-summarize
```

## Verifying the ratio behavior

Manual check on two corpora:

1. **Long doc (≥ 5,000 chars)**: pick a paper or long blog post, run the pipeline, then `grep '^actual_ratio:' L{1,2,3}-*.md`. Expect each value in `[0.25, 0.45]` and ideally near `0.35`.
2. **Short doc (≈ 1,500 chars)**: pick a brief article, run the pipeline, `grep '^skipped_layers' meta.json` to see which layers got pre-empted by the 80-char floor. Inspect surviving layers' `actual_ratio` — they should still sit in band.

Both should also produce a `consistency-checker` verdict of `ok: true` (modulo coverage warnings) without `ratio` issues.

## Notes

- This command never commits. Inspect with `git diff --staged` and commit when satisfied.
- For long sources (>50k tokens), `summarizer-L3` chunks by chapter automatically.
- Authentication-bearing URLs are not supported.
