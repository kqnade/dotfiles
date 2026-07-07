---
paths:
  - "Cargo.toml"
  - "Cargo.lock"
  - "rust-toolchain"
  - "rust-toolchain.toml"
  - "**/*.rs"
---

# Rust

- Run `cargo fmt` and the project's `cargo clippy` profile before finishing Rust changes.
- Prefer type-level invariants: newtypes, enums, builders, and non-empty/domain-specific types over loose primitives.
- Library code should return `Result` for expected failures. Avoid `unwrap`, `expect`, and `panic!` outside tests, examples, and impossible invariants with comments.
- Use `?` to propagate errors and add context at boundaries with the project's existing error crate or style.
- Do not hold locks, `RefCell` borrows, or blocking resources across `.await`.
- Prefer borrowing (`&str`, `&[T]`, `impl AsRef<Path>`) in APIs when ownership is not required.
- Keep `unsafe` minimal, isolated, and documented with the invariants that make it sound.
- Public APIs need rustdoc. Document `Errors`, `Panics`, and `Safety` sections where relevant.
- Keep features additive and tested. Avoid enabling heavy optional dependencies by default.
- Use integration tests for public behavior and unit tests near private logic.
- For binaries, keep CLI parsing, config loading, business logic, and I/O separable enough to test.
