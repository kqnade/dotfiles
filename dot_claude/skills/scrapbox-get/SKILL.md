---
name: scrapbox-get
description: Use when the user asks to fetch / read / get a Scrapbox page by title, or invokes /scrapbox-get. Retrieves raw page text via Scrapbox API using the personal access token from `pass`. Default project is `tqlt`.
allowed-tools: ["Bash"]
argument-hint: <page> [project]
---

# scrapbox-get: Fetch Scrapbox page text

Fetches the raw text of a Scrapbox page from the Scrapbox API, authenticating with a personal access token stored in `pass` at `token/scrapbox`.

## When to Use

- User invokes `/scrapbox-get <page>` or `/scrapbox-get <page> <project>`
- User asks to "fetch", "read", "get", or "show" a Scrapbox page by its title
- User references a Scrapbox page slug and wants its contents

## Arguments

`$ARGUMENTS`, parsed as 1 or 2 positional tokens:

1. `<page>` (required) — page title / slug (e.g. `k47de`). URL-encode if it contains spaces or non-ASCII (use `jq -rR @uri` or `python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' <page>`).
2. `<project>` (optional) — Scrapbox project name. Defaults to `tqlt`.

If no `<page>` is given, ask the user which page to fetch before proceeding.

## Steps

### 1. Resolve arguments

- `page` = first token
- `project` = second token if present, otherwise `tqlt`
- If `page` contains characters that need URL-encoding, encode it.

### 2. Verify token is available

```bash
pass show token/scrapbox >/dev/null 2>&1 || echo "MISSING_TOKEN"
```

If missing, tell the user that `pass show token/scrapbox` failed and stop.

### 3. Fetch the page

```bash
curl -fsSL "https://scrapbox.io/api/pages/<project>/<page>/text" \
  -H "x-personal-access-token: $(pass show token/scrapbox)"
```

- Use `-f` so HTTP errors (404 etc.) surface as non-zero exit.
- Use `-s` to keep output clean.
- Do **not** echo the token or include it in any logged output.

### 4. Present the result

- Show the raw page text to the user.
- If the page was not found (404), tell the user the page does not exist in `<project>` and suggest checking the slug.
- For very long pages, offer to summarize or save to a file rather than dumping the full content if the user seems to want a digest.

## Notes

- The endpoint returns plain Scrapbox notation (links in `[brackets]`, code blocks as `code:filename` followed by indented lines, etc.). Preserve that formatting when relaying.
- Never write the token to disk or to any file Claude creates.
