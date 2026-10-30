#!/usr/bin/env python3
"""Run the offline repository validators and behavior tests."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def suite_commands(directory: Path) -> list[list[str]]:
    python_files = sorted({*directory.glob("test-*.py"), *directory.glob("validate-*.py")}
                          - {directory / "validate-repository.py"})
    commands = [[sys.executable, "-B", str(path)] for path in python_files]
    node_files = sorted(directory.glob("test-*.mjs"))
    if node_files:
        commands.append(["node", "--experimental-strip-types", "--test",
                         *map(str, node_files)])
    return commands


def run_suite(directory: Path) -> int:
    for command in suite_commands(directory):
        print("+ " + " ".join(command), flush=True)
        result = subprocess.run(command, cwd=ROOT, check=False)
        if result.returncode != 0:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(run_suite(Path(__file__).resolve().parent))
