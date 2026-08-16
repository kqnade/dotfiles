#!/usr/bin/env python3

"""Validate repository layout, removals, and machine-readable file invariants."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

from validate_common import (
    EXPECTED_AGENT_SKILLS as expected_agent_skills,
    EXPECTED_CLAUDE_RULE_TARGETS as expected_claude_rule_targets,
    ROOT,
    fail,
    strip_json_comments,
    tracked_files,
)


if (ROOT / "dot_claude/hooks/executable_herdr-review-notify.sh").exists():
    fail("legacy Herdr review notification hook remains")

removals = (ROOT / ".chezmoiremove").read_text().splitlines()
for restored_rule_name in expected_claude_rule_targets:
    restored_target = f".claude/rules/{restored_rule_name}"
    if restored_target in removals:
        fail(f"restored Claude rule must not remain in .chezmoiremove: {restored_target}")

if ".codex/AGENTS.md" in removals:
    fail("restored Codex global AGENTS.md must not remain in .chezmoiremove")
if ".config/opencode/AGENTS.md" in removals:
    fail("restored OpenCode global AGENTS.md must not remain in .chezmoiremove")

opencode_global_rule_link = ROOT / "dot_config/opencode/symlink_AGENTS.md"
if not opencode_global_rule_link.is_file():
    fail("OpenCode global AGENTS.md symlink source is missing")
if (
    opencode_global_rule_link.read_text().strip()
    != "../../.agents/rules/workflow-state.md"
):
    fail("OpenCode global AGENTS.md must link to the canonical workflow-state rule")

for restored_skill_name in expected_agent_skills:
    restored_target = f".claude/skills/{restored_skill_name}"
    if restored_target in removals:
        fail(f"restored Claude skill must not remain in .chezmoiremove: {restored_target}")

for target in (
    ".claude/CLAUDE.md",
    ".claude/agents/frontend-designer.md",
    ".claude/hooks/auto-test.sh",
    ".claude/hooks/herdr-review-notify.sh",
    ".claude/rules/development.md",
    ".claude/rules/review.md",
    ".claude/agents/code-reviewer.md",
    ".claude/agents/doc-reviewer.md",
    ".claude/agents/independent-consultant.md",
    ".claude/agents/performance-reviewer.md",
    ".claude/agents/pr-test-analyzer.md",
    ".claude/agents/security-reviewer.md",
    ".claude/agents/silent-failure-hunter.md",
    ".claude/skills/adversarial-review",
    ".claude/skills/catchup",
    ".claude/skills/conversation-context-export",
    ".claude/skills/conversation-context-import",
    ".claude/skills/develop",
    ".claude/skills/library-update-review",
    ".claude/skills/pr-review",
    ".claude/skills/project-memory",
    ".claude/skills/sanity-review",
    ".claude/skills/ship",
    ".claude/skills/subagent-consultation",
    ".config/opencode/plugins/claude-rules.ts",
    ".config/agent-workflows/state-home",
    ".config/project-maker",
    ".config/zsh/" + "agent-mail.zsh",
    ".kimi-code/AGENTS.md",
    ".kimi-code/mcp.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1",
    "Library/LaunchAgents/com.user.yaskkserv2.plist",
    ".config/systemd/user/yaskkserv2.service",
    ".config/mise/.env",
    ".config/mise/.miserc.toml",
    ".config/mise/miserc.toml",
    ".config/zsh/functions/mise.zsh",
):
    if target not in removals:
        fail(f"deleted chezmoi target is missing from .chezmoiremove: {target}")

for path in tracked_files():
    if path in {ROOT / ".chezmoiremove", Path(__file__).resolve()}:
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue

    compact = text.casefold()
    forbidden = (
        "home" + "brew",
        "mcp_" + "agent_mail",
        "mcp-" + "agent-mail",
        "agent" + "-mail",
        "agent" + " mail",
        "scoop",
        "msys2",
    )
    for needle in forbidden:
        if needle in compact:
            fail(f"obsolete integration reference {needle!r} remains in {path.relative_to(ROOT)}")

for path in tracked_files():
    if path.suffix != ".json":
        continue
    try:
        json.loads(path.read_text())
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {error}")
