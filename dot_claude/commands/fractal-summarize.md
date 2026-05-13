---
description: Generate a fractal-reader-style 5-layer summary in the current (or specified) directory. Each layer is written for a different reader profile (L5=Original, L4=Graduate, L3=Undergrad, L2=High School, L1=Middle School). Usage: /fractal-summarize [--lang <code>] [<dir>|<url>] [<dir>]
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent"]
argument-hint: [--lang <code>] [<dir>|<url>] [<dir>]
---

# /fractal-summarize

Run the fractal-reader-style summarization pipeline on a document. The output directory **is** the input directory — there is no `slug` and no nested `docs/` folder.

## Design philosophy

This pipeline is modelled after **fractal-reader.com**: the document is rendered at five reader-profile layers, not five fixed-ratio compressions.

| Layer | Reader profile | Compression vs parent | Generator model | Annotations |
|-------|---------------|------------------------|------------------|-------------|
| L5    | Original (full document) | — | (extraction only) | preserved as-is |
| L4    | Graduate / Field-native | heavy (~15〜25% of L5 on long docs) | `opus[1m]` | none |
| L3    | Upper-undergrad / Adjacent-field | ±30% of L4 (rewrite, not compress) | `sonnet` | light `{{d\|...}}` on acronyms |
| L2    | High-school senior | ±30% of L3 (rewrite) | `sonnet` | heavy `{{d\|...}}`, some `{{s\|...}}` |
| L1    | Middle school | ±30% of L2 (rewrite) | `haiku` | heavy `{{d\|...}}` and `{{s\|...}}` |

The pass/fail criterion for each layer is **reader-fit** (a self-check inside each summarizer), not a numeric ratio. Only the L5→L4 step actually compresses content; L3/L2/L1 reshape the same scope for less-specialized readers.

### Annotation grammar

- `{{d| 短い定義}}` — inline gloss for a jargon term, written for the layer's reader profile.
- `{{s| 補足説明}}` — supplemental context (one or two sentences) filling in background the reader is missing.
- `{$ ... $}` — inline LaTeX math (brace-wrapped for fractal-reader compatibility).
- `{$$ ... $$}` — block LaTeX math, on its own paragraph.

The brace-wrapped form is preserved by Markdown renderers that don't know about it, and recognized by fractal-reader (or any local renderer modelled on it).

### Numbering

Note that **L5 is the largest** (the original) and **L1 is the simplest** (middle-school rewrite). This reverses the numbering of the previous pipeline. Files are renamed accordingly (`L5-original.md`, `L4-graduate.md`, `L3-undergrad.md`, `L2-highschool.md`, `L1-middleschool.md`).

## Arguments

User-supplied: `$ARGUMENTS`.

**Flag** (may appear anywhere):

- `--lang <code>` — ISO 639-1 code for the **summary** output language (L1〜L4). Default `ja`. The source document language is auto-detected and recorded separately.

**Positional** (after extracting `--lang`):

| Form                                   | Behavior                                       |
|----------------------------------------|------------------------------------------------|
| (none)                                 | summarize source file in CWD                   |
| `<dir>`                                | summarize source file in `<dir>`               |
| `<url>`                                | fetch URL into CWD, then summarize             |
| `<url> <dir>`                          | fetch URL into `<dir>`, then summarize         |

A token is a URL iff it starts with `http://` or `https://`.

Examples:

```
/fractal-summarize                                # ja, CWD
/fractal-summarize --lang en                      # English summary, CWD
/fractal-summarize https://arxiv.org/pdf/1706.03762
```

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
L1-middleschool.md  L2-highschool.md  L3-undergrad.md  L4-graduate.md
L5-original.md  anchors.json  meta.json  source.txt
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

### Step 5 — Generate `L5-original.md`

Extract to plain Markdown:

- `.pdf` → `pdftotext -layout <file> -` (stdout)
- `.html`/`.htm` → `npx -y defuddle parse <file> --markdown`
- `.md` → copy body verbatim
- `.txt` → wrap body verbatim

Strip BOM, normalize line endings to LF, then write `<dir>/L5-original.md` with this frontmatter:

```yaml
---
layer: L5
source_file: <basename of the source file>
extracted_with: pdftotext-layout|defuddle|copy
actual_chars: <wc -m of body>
generated_at: <ISO-8601 with timezone>
---
```

### Step 6 — Initialize `meta.json`

```json
{
  "title": "<H1 from L5 if present, else source basename without extension>",
  "source": {
    "type": "pdf|md|html|txt",
    "file": "<basename of the source file>",
    "path_or_url": "<URL from source.txt if URL mode, else ./<basename>>"
  },
  "language": "<detected source language; filled in by summarizer-L4>",
  "summary_language": "<value of --lang, default 'ja'>",
  "schema_version": 3,
  "created_at": "<ISO-8601 with timezone>",
  "last_regenerated": {},
  "skipped_layers": [],
  "anchors_skipped": false
}
```

`summary_language` controls the output language of L1〜L4. `language` is the auto-detected language of the **source** (L5); it is filled in once `summarizer-L4` (or, if L4 is skipped, the first non-skipped summarizer that reads L5) reports it.

`schema_version: 3` marks this as the fractal-reader-style pipeline.

### Step 7 — Skip judgment

Read `L5.actual_chars`. Set `skipped_layers` based on absolute size, not parent ratios:

| L5 size            | Generated layers                  | Skipped layers       |
|--------------------|-----------------------------------|----------------------|
| ≥ 1,500 chars      | L4, L3, L2, L1                    | (none)               |
| 400〜1,499 chars   | L4 only                           | L3, L2, L1           |
| < 400 chars        | (no layers — L5 stands alone)     | L4, L3, L2, L1       |

Reason: below 1,500 chars there's no useful difference between Graduate and Middle School rewrites of the same content; below 400 chars there's nothing left to compress at L4 either.

Record skipped layers in `meta.json.skipped_layers` immediately.

### Step 8 — Layer cascade

Maintain `last_present_layer = "L5"`.

For each layer in `[L4, L3, L2, L1]` (in order):

1. If the layer is in `skipped_layers`, do not invoke its summarizer.
2. Otherwise:
   - Invoke `summarizer-L<n>` via the Agent tool, passing:
     - the absolute path of `<dir>/`
     - the parent layer name (= `last_present_layer`)
     - `summary_language` (from `meta.json.summary_language`)
   - Wait for completion.
   - Update `last_present_layer = "L<n>"`.
   - Update `meta.json.last_regenerated.L<n>` to now.
   - The first summarizer that reads L5 also reports the detected source language; write it into `meta.json.language` if not already set.

No ratio enforcement at the orchestrator. Each summarizer runs its own reader-fit self-check.

### Step 9 — Anchors and consistency check

If at least one of `L4`/`L3`/`L2` is present (not all in `skipped_layers`), invoke `anchor-mapper`. Otherwise set `meta.json.anchors_skipped = true` and skip.

`anchor-mapper` and `consistency-checker` may run in parallel (independent inputs).

Invoke `consistency-checker` regardless. Capture its stdout JSON and display it to the user verbatim.

### Step 10 — Stage but do not commit

If CWD (or `<dir>`) is inside a git repo:

```bash
git add <dir>/
```

Otherwise skip silently. **Never commit.**

Display a tree summary:

```
<dir>/
├── <source-basename>           (original)
├── source.txt                  (URL mode only)
├── L5-original.md              (NN chars)
├── L4-graduate.md              (NN chars)         [Graduate reader]
├── L3-undergrad.md             (NN chars)         [Undergrad reader]
├── L2-highschool.md            (NN chars)         [High-school reader]
├── L1-middleschool.md          (NN chars)         [Middle-school reader]
├── anchors.json                (M anchors)        [omitted if anchors_skipped]
└── meta.json
```

Followed by the consistency-checker JSON verdict.

## HTML extraction tool — selection rationale

**defuddle** (kepano, Obsidian Web Clipper origin) is used via `npx -y defuddle parse <file> --markdown`. Reasons: actively maintained in 2026; multi-pass extraction adapts where Mozilla Readability gives up on modern sites; standardizes math, code, and footnotes — friendly to downstream summarization. Via `npx` defuddle needs no global install.

## Usage examples

```bash
# Pattern 1 — fetch URL directly (academic paper)
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

## Notes for paper workflows

- `summarizer-L4` is configured to preserve citation keys, dataset/model/benchmark names, equation numbers, and theorem/proof structure — all the load-bearing artifacts a peer reviewer would look for.
- All formulas across all layers use brace-wrapped LaTeX (`{$ ... $}` inline, `{$$ ... $$}` block) so they survive Markdown rendering and are recognized by fractal-reader-compatible viewers.
- Anchors map every L4/L3/L2 sentence directly back to L5 line numbers — useful when L3 looks suspicious and you want to verify against the original.

## Notes

- This command never commits. Inspect with `git diff --staged` and commit when satisfied.
- For long sources (>50k tokens), `summarizer-L4` chunks by chapter automatically.
- Authentication-bearing URLs are not supported.
