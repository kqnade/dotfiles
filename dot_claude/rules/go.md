---
paths:
  - "go.mod"
  - "go.sum"
  - "**/*.go"
---

# Go

- Run `gofmt`/`goimports` on changed files. Use `go test ./...`; add `-race` for concurrency-sensitive changes.
- Keep packages small and cohesive. Avoid `util`/`common` packages unless they have a real domain.
- Accept interfaces, return structs. Define interfaces where they are consumed, not where implementations live.
- Keep interfaces tiny. One to three methods is normal; large interfaces usually hide poor boundaries.
- Pass `context.Context` as the first argument for request-scoped, I/O, or long-running operations. Do not store contexts in structs.
- Always call `cancel` for contexts you create, usually with `defer cancel()`.
- Wrap errors with operation context using `%w`. Compare with `errors.Is`/`errors.As`; do not string-match errors.
- Return errors instead of panicking in libraries. Panic only for impossible programmer errors or process startup failures.
- Use table-driven tests for variants. Put tests near the code and name cases by behavior.
- Prefer constructor injection over package globals. Keep side effects out of `init` unless unavoidable.
- Use functional options for optional configuration when a constructor would otherwise grow many parameters.
- Read secrets from environment or secret stores at startup. Never log secrets or embed them in code/tests.
- For security-sensitive code, run `gosec` if available and review timeouts, input validation, and path handling.
- For concurrent code, document goroutine ownership, channel closing responsibility, and cancellation behavior.
