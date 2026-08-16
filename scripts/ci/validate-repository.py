#!/usr/bin/env python3

"""Compatibility entry point for the focused repository validators."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALIDATORS = (
    "validate-shell-integrations.py",
    "validate-claude-authorization.py",
    "validate-agent-materialization.py",
    "validate-workflow-state.py",
    "validate-repository-layout.py",
    "validate-agent-client-config.py",
    "validate-project-contracts.py",
)


def main() -> int:
    for validator in VALIDATORS:
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/ci" / validator)],
            cwd=ROOT,
            check=False,
        )
        if result.returncode != 0:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
