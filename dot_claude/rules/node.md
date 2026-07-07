---
paths:
  - "package.json"
  - "package-lock.json"
  - "npm-shrinkwrap.json"
  - "pnpm-lock.yaml"
  - "yarn.lock"
  - "bun.lock"
  - "bun.lockb"
  - ".nvmrc"
  - ".node-version"
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.cjs"
---

# Node.js

- Respect the detected package manager. Do not mix lockfiles or switch tools without an explicit migration.
- Use the lockfile in CI: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, or `bun install --frozen-lockfile`.
- Keep ESM/CommonJS consistent with `package.json` `type`, file extensions, and existing import style.
- Validate environment variables once at startup. Treat `process.env` as untyped external input.
- Prefer `node:` imports for built-ins (`node:fs`, `node:path`, `node:test`).
- Avoid blocking the event loop in request paths. Move CPU-heavy work to workers or background jobs.
- Always set timeouts/abort signals for outbound HTTP, child processes, and long-running async work.
- Handle stream and socket errors explicitly. Unhandled `error` events can crash the process.
- For servers, set request/header/keep-alive timeouts and put a reverse proxy in front for production.
- Never publish secrets or build artifacts. Check `files`, `.npmignore`, and `npm publish --dry-run` for packages.
- Treat dependency changes as supply-chain changes: review install scripts, new transitive deps, and lockfile churn.
- Use the project's test runner. If none exists and Node version supports it, prefer `node:test` before adding a framework.
