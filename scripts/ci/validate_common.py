"""Shared helpers for the independently runnable repository validators."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

EXPECTED_CLAUDE_RULE_TARGETS = {
    "coding.md",
    "delivery.md",
    "git.md",
    "operations.md",
    "verification.md",
    "workflow-state.md",
}
EXPECTED_AGENT_SKILLS = {
    "assumption-pruning",
    "context-handoff",
    "execute-worktree-implementation",
    "evidence-review",
    "herdr",
    "peer-consultation",
    "prose-proofreading",
    "remove-conversation-residue",
    "route-large-implementation",
    "security-audit",
    "test-driven-development",
    "todo-management",
    "using-workflow-skills",
}


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def tracked_files() -> list[Path]:
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    )
    return [
        ROOT / name.decode()
        for name in output.split(b"\0")
        if name and (ROOT / name.decode()).is_file()
    ]


def strip_json_comments(text: str) -> str:
    output: list[str] = []
    index = 0
    in_string = False
    escaped = False
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""

        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            index += 1
        elif char == "/" and next_char == "/":
            index += 2
            while index < len(text) and text[index] != "\n":
                index += 1
        elif char == "/" and next_char == "*":
            end = text.find("*/", index + 2)
            if end == -1:
                fail("unterminated block comment in JSONC")
            output.append("\n" * text[index : end + 2].count("\n"))
            index = end + 2
        else:
            output.append(char)
            index += 1
    return "".join(output)
