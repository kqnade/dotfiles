---
paths:
  - "deps.edn"
  - "project.clj"
  - "build.clj"
  - "bb.edn"
  - "shadow-cljs.edn"
  - ".clj-kondo/**"
  - "**/*.clj"
  - "**/*.cljs"
  - "**/*.cljc"
  - "**/*.edn"
---

# Clojure

- Run `clj-kondo` if configured. Use the project's formatter (`zprint`, `cljfmt`, or editor integration) rather than hand-formatting.
- Keep one namespace per file and one file per namespace. Use `:require` with aliases; avoid `:use` and `refer :all`.
- Prefer pure functions and immutable data transformations. Isolate side effects at system boundaries.
- Model behavior with data first. Reach for protocols/multimethods only when dispatch is genuinely open or polymorphic.
- Use idiomatic names: predicates end with `?`, side-effecting functions end with `!`, conversions use `->`.
- Prefer `when`, `when-let`, `if-let`, `some->`, `cond->`, and threading macros when they clarify data flow.
- Do not define vars inside functions. Avoid forward declarations unless they break a real cycle.
- Use `ex-info` with structured `ex-data` for domain errors; catch specific exception types at boundaries.
- Use `with-open` for closeable resources and avoid lazy sequences escaping resource scopes.
- Tests should use `clojure.test` conventions unless the project uses Kaocha, Midje, or another runner.
- In CLJS, keep host interop and side effects narrow; validate JS object shapes at boundaries.
