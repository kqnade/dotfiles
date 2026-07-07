---
paths:
  - "**/*_test.go"
  - "**/testdata/**"
---

# Go Testing

- Use standard `go test` unless the project already uses a different runner.
- Prefer table-driven tests for variants. Name cases by behavior, not implementation detail.
- Keep tests in the same package for internals and `<pkg>_test` when testing only the public API.
- Use `t.Helper()` in helpers and return useful failure messages.
- Use `t.TempDir()`, `t.Setenv()`, and `t.Cleanup()` instead of hand-rolled cleanup.
- Use `httptest`, `net.Pipe`, fake clocks, and in-memory implementations before heavy mocks.
- Run focused tests while iterating, then `go test ./...` before finishing. Use `-race` for concurrent code.
- Do not assert map iteration order, wall-clock timing, goroutine scheduling, or other nondeterminism.
- Keep golden files in `testdata/`; update them intentionally and review the diff.
