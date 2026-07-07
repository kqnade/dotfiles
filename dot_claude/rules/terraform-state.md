---
paths:
  - "**/backend.tf"
  - "**/*state*.tf"
  - ".terraform.lock.hcl"
  - "**/*.tfstate"
  - "**/*.tfstate.backup"
---

# Terraform State

- Never run `terraform apply`, `destroy`, `import`, `state`, or `force-unlock` without explicit user approval.
- Do not commit state files, plan files, crash logs, or provider plugin directories.
- Keep state remote, locked, encrypted, and separated by environment.
- Review backend changes carefully. Moving state requires an explicit migration plan and rollback path.
- Prefer `moved` and `import` blocks for shared refactors when supported by the project's Terraform version.
- Review plans for replacements, deletions, public exposure, IAM broadening, and drift before approval.
- Mark secrets as `sensitive`, but assume they may still be present in state and handle state access accordingly.
