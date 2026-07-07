---
paths:
  - ".luacheckrc"
  - "stylua.toml"
  - ".stylua.toml"
  - "selene.toml"
  - "**/*.lua"
  - "**/*.luau"
---

# Lua

- Use the project's formatter (`stylua` if present) and linter (`luacheck` or `selene` if present).
- Keep variables `local` by default. Avoid implicit globals and shared mutable module state.
- Return a module table or function explicitly. Do not mutate `_G` unless the project already relies on that pattern.
- Use LuaCATS annotations (`---@param`, `---@return`, `---@class`, `---@type`) for public APIs and complex tables.
- Distinguish `false` from `nil` intentionally. Do not use truthiness when absence and false are different states.
- Prefer table-driven dispatch over long chains of string conditionals when the set of operations is stable.
- Keep metatable magic small and documented. Avoid surprising `__index`/`__newindex` behavior in ordinary data objects.
- Use `pcall`/`xpcall` only at boundaries where errors can be reported or converted. Do not swallow errors silently.
- For Neovim Lua, keep plugin setup idempotent and avoid global side effects during module import.
- Write tests with the project's runner (`busted`, `plenary`, `luaunit`, or custom harness) and cover nil/error cases.
