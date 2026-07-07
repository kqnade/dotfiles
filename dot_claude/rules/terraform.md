---
paths:
  - "**/*.tf"
  - "**/*.tfvars"
  - "**/*.tfvars.json"
  - ".tflint.hcl"
  - "terraform.rc"
  - ".terraformrc"
---

# Terraform

- Run `terraform fmt` and `terraform validate` before committing Terraform changes. Use TFLint if configured.
- Pin provider versions and commit `.terraform.lock.hcl` for root modules.
- Pin external module versions in production. Avoid unversioned registry or Git module sources.
- Prefer clear root modules per environment over clever workspace-dependent behavior.
- Standard reusable modules should have `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, and a README.
- Every variable and output should have a useful description; constrained variables should have `validation` blocks.
- Mark secret inputs and outputs as `sensitive = true`, but remember sensitive values may still exist in state.
- Keep modules focused. Avoid modules that conditionally manage unrelated infrastructure domains.
