---
paths:
  - "pytest.ini"
  - "**/*.py"
  - "**/*.pyi"
---

# Python

- Use Ruff if present for linting/formatting. Otherwise follow the project's existing Black/isort/flake8 setup.
- Annotate public functions and module boundaries. Use `Sequence`/`Mapping` inputs when mutation is not required.
- Avoid mutable default arguments. Use `None` plus initialization or `dataclasses.field(default_factory=...)`.
- Prefer `pathlib.Path` over string path manipulation.
- Use context managers for files, locks, network clients, and temporary resources.
- Catch specific exceptions. Do not use bare `except` except at process boundaries that re-raise or log safely.
- Preserve exception context with `raise ... from err` when translating errors.
- Keep import-time side effects minimal. Configuration, logging setup, and network calls belong in startup code.
- In async code, never block the event loop with sync I/O or CPU-heavy work.
- Write tests with pytest conventions if pytest is present; otherwise use the existing runner.
