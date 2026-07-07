---
paths:
  - "pyproject.toml"
  - "uv.lock"
  - "poetry.lock"
  - "pdm.lock"
  - "requirements*.txt"
  - "setup.py"
  - "setup.cfg"
  - "tox.ini"
  - "noxfile.py"
---

# Python Packaging

- Prefer `pyproject.toml` for project metadata and tool configuration. Do not add new `setup.py` logic unless required.
- Respect the existing environment and dependency tool: `uv`, Poetry, PDM, Hatch, pip-tools, tox, or nox.
- Do not mix dependency managers or regenerate lockfiles with a different tool.
- Keep runtime, dev, test, docs, and optional extras separated according to the project's current convention.
- Pin application dependencies through lockfiles. Libraries should express compatible ranges instead of over-pinning.
- Include `requires-python` and keep it aligned with CI and classifiers.
- Keep build backends explicit. Do not change build backend without a migration reason.
- Treat lockfile updates as supply-chain changes: review new packages, extras, markers, and platform-specific deps.
