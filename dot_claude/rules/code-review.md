# Code Review Standards

## Purpose

Code review ensures quality, security, and maintainability before code is merged.
Apply this rule proportionally: a full review for substantive code changes, a light
pass for config/docs/dotfiles tweaks.

## When to Review

Review before merging when the change:

- Adds or modifies non-trivial code
- Touches security-sensitive areas (auth, payments, user data)
- Changes architecture or public interfaces

Before requesting review, ensure CI is passing, merge conflicts are resolved,
and the branch is up to date with the target branch.

## Review Checklist

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines) and files cohesive (<800 lines)
- [ ] No deep nesting (>4 levels) — use early returns
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No leftover debug output
- [ ] New functionality has tests (where the project has a test suite;
      aim for ~80% coverage on projects that track it)

## Security Review Triggers

Run `/security-review` when the change touches:

- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- External API calls
- Cryptographic operations
- Payment or financial code

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Tools

| Tool | Purpose |
|------|---------|
| `/code-review` (built-in skill) | Correctness bugs and cleanup in the current diff |
| `coderabbit:code-review` (plugin skill) | Thorough AI review of changes / PRs |
| `/security-review` (built-in skill) | Security review of pending changes |
| `/review` (built-in skill) | Review a GitHub pull request |

## Common Issues to Catch

### Security

- Hardcoded credentials (API keys, passwords, tokens)
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input)
- Path traversal (unsanitized file paths)
- CSRF protection missing
- Authentication bypasses

### Code Quality

- Large functions / files — split or extract
- Deep nesting — use early returns
- Missing error handling — handle explicitly
- Mutation patterns — prefer immutable operations
- Missing tests — add coverage

### Performance

- N+1 queries — use JOINs or batching
- Missing pagination / unbounded queries — add LIMIT and constraints
- Missing caching — cache expensive operations

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: Only HIGH issues (merge with caution)
- **Block**: CRITICAL issues found

## Integration with Other Rules

- [testing.md](testing.md) - Test standards
- [security.md](security.md) - Security checklist
- [git-workflow.md](git-workflow.md) - Commit standards
- [agents.md](agents.md) - Agent delegation
