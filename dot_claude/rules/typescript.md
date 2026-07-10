---
paths:
  - "tsconfig*.json"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "**/*.cts"
  - "**/*.d.ts"
  - "eslint.config.*"
  - ".eslintrc*"
---

# TypeScript

- Prefer `strict: true`. Do not weaken strictness to make a local error disappear.
- Avoid `any`. Use `unknown` at boundaries, narrow it, then convert to domain types.
- Validate external data at runtime: HTTP bodies, JSON files, env vars, localStorage, CLI args, and message queues.
- Model states with discriminated unions instead of boolean flags and loosely related optional fields.
- Use `satisfies` for object literals that must conform to an interface while preserving narrow inference.
- Keep public function return types explicit when they are part of an API or exported from a package.
- Prefer `readonly` arrays/objects for inputs that are not mutated.
- Await independent promises with `Promise.all`, not sequentially.
- Do not use `as` assertions to bypass design issues. Use them only after a local runtime check or for unavoidable interop.
- Avoid `// @ts-ignore`. If suppression is unavoidable, use `// @ts-expect-error` with a short reason.
- Do not rely on `skipLibCheck` or generated declaration files to hide real project type errors.
- Keep module resolution aligned with the runtime: `nodenext` for modern Node, `bundler` for bundled apps.
- Run the project's typecheck command after changing shared types, exported APIs, or `tsconfig`.
