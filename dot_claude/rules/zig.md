---
paths:
  - "build.zig"
  - "build.zig.zon"
  - "**/*.zig"
---

# Zig

- Run `zig fmt` on changed Zig files. Use `zig build test` or the project's test step when available.
- Prefer `const` over `var`; use mutation only when it communicates real state change.
- Pass allocators explicitly for heap allocation. Document ownership of allocated memory and who calls `deinit`/`free`.
- Pair allocations and resource acquisition with `defer`/`errdefer` immediately after success.
- Do not read from `undefined`; use it only for values that are definitely overwritten before use.
- Prefer precise error sets for library APIs when practical; avoid collapsing everything into `anyerror` at boundaries.
- Use `try` for propagation and `catch` only when you can recover, translate, or add context.
- Use optionals for absence and error unions for failure. Do not encode both with sentinel values.
- Keep `comptime` code small and purposeful. Avoid hiding runtime complexity behind generics.
- Tests belong near the code when they document behavior; use `std.testing.expectEqual`, `expectError`, and the testing allocator.
- For public declarations, add doc comments that describe ownership, error behavior, and caller obligations.
