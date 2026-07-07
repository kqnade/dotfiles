---
paths:
  - "**/*.go"
  - "**/auth/**"
  - "**/crypto/**"
  - "**/middleware/**"
  - "**/handlers/**"
  - "**/routes/**"
---

# Go Security

- Read secrets from environment or secret stores at startup. Never log secrets, tokens, credentials, or PII.
- Validate and canonicalize all user-controlled paths. Prevent traversal before file access.
- Use `context.Context` timeouts for network, database, subprocess, and request-scoped work.
- Configure HTTP servers with header, read, write, idle, and shutdown timeouts.
- Use parameterized queries. Never build SQL or shell commands by concatenating user input.
- Use `crypto/rand` for security-sensitive randomness; never `math/rand`.
- Compare secrets and tokens with constant-time comparison when applicable.
- Check TLS settings and certificate verification before changing HTTP clients.
- Run `gosec` if available for security-sensitive Go changes, then review findings manually.
