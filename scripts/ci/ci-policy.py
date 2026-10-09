#!/usr/bin/env python3
"""Select bootstrap jobs and validate their aggregate GitHub Actions result."""

from __future__ import annotations

import argparse
import json
import os
import sys


BOOTSTRAP_JOBS = (
    "package-bootstrap",
    "linux-bootstrap",
    "macos-bootstrap",
    "intel-fallback",
)
STATIC_ONLY_FILES = {
    "README.md",
    "TODO.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".gitignore",
    ".github/CODEOWNERS",
    "renovate.jsonc",
}


def needs_bootstrap(paths: list[str]) -> bool:
    if not paths:
        return True
    for path in paths:
        if path == "scripts/ci/ci-policy.py":
            return True
        if path in STATIC_ONLY_FILES or path.startswith(("docs/", "scripts/ci/")):
            continue
        return True
    return False


def check_results(needs: dict) -> list[str]:
    errors = []
    for name in ("changes", "static"):
        if needs.get(name, {}).get("result") != "success":
            errors.append(f"{name} must succeed")
    bootstrap = needs.get("changes", {}).get("outputs", {}).get("bootstrap")
    if bootstrap not in ("true", "false"):
        errors.append("changes must produce a valid bootstrap plan")
    expected = "skipped" if bootstrap == "false" else "success"
    for name in BOOTSTRAP_JOBS:
        actual = needs.get(name, {}).get("result")
        if actual != expected:
            errors.append(f"{name}: expected {expected}, got {actual}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("plan")
    plan.add_argument("--full", action="store_true")
    commands.add_parser("check")
    args = parser.parse_args()

    if args.command == "plan":
        full = args.full
        if not full:
            payload = sys.stdin.buffer.read()
            if payload and not payload.endswith(b"\0"):
                parser.error("changed paths must be NUL-terminated")
            paths = [os.fsdecode(path) for path in payload.split(b"\0")[:-1]]
            if any(not path for path in paths):
                parser.error("changed paths must not be empty")
            full = needs_bootstrap(paths)
        print(f"bootstrap={str(full).lower()}")
        return 0

    needs = json.loads(os.environ["NEEDS_JSON"])
    errors = check_results(needs)
    for error in errors:
        print(error, file=sys.stderr)
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
