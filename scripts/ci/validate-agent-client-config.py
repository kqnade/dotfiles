#!/usr/bin/env python3

"""Validate OpenCode and Claude client configuration invariants."""

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

from validate_common import ROOT, fail, strip_json_comments, tracked_files


opencode = json.loads((ROOT / "dot_config/opencode/opencode.json").read_text())
if opencode.get("autoupdate") is not False:
    fail("OpenCode self-update must remain disabled; mise owns the pinned version")

opencode_instructions = opencode.get("instructions")
if not isinstance(opencode_instructions, list):
    fail("OpenCode instructions must be a list")
if "AGENTS.md" in opencode_instructions:
    fail("OpenCode must not load AGENTS.md twice")
if ".cursor/rules/*.md" not in opencode_instructions:
    fail("OpenCode must retain project Cursor rule discovery")

opencode_permissions = opencode.get("permission")
if not isinstance(opencode_permissions, dict):
    fail("OpenCode permission must be an object")
opencode_bash = opencode_permissions.get("bash")
if not isinstance(opencode_bash, dict):
    fail("OpenCode permission.bash must be an object")
if opencode_bash.get("*") != "ask":
    fail("OpenCode shell commands must ask by default")
if opencode_bash.get("git *") == "allow":
    fail("OpenCode must not pre-approve the git namespace")

required_opencode_bash = {
    "allow": {
        "git status *",
        "git diff *",
        "git log *",
        "git show *",
        "git rev-parse *",
        "git ls-files *",
        "git add *",
        "git commit *",
    },
    "ask": {
        "git add .",
        "git add -A *",
        "git commit --amend *",
        "git reset *",
        "git clean *",
        "git restore *",
        "git push *",
        "npm publish *",
        "cargo publish *",
        "go install *",
    },
    "deny": {
        "rm -rf *",
        "git push --force *",
        "git push --force-with-lease *",
    },
}
for action, patterns in required_opencode_bash.items():
    invalid = {
        pattern
        for pattern in patterns
        if opencode_bash.get(pattern) != action
    }
    if invalid:
        fail(f"OpenCode permission.bash must set {action}: {sorted(invalid)}")

settings_template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
try:
    settings = json.loads(settings_template.split("{{-", 1)[0])
except json.JSONDecodeError as error:
    fail(f"invalid Claude settings JSON: {error}")

if settings.get("language") != "Japanese":
    fail("Claude language must not encode a voice or tone")

if settings.get("model") != "opus[1m]":
    fail("Claude default model must track the latest Opus release")

if settings.get("autoMemoryEnabled") is not False:
    fail("Claude automatic memory must remain disabled; use explicit workflow state")

enabled_plugins = settings.get("enabledPlugins")
if not isinstance(enabled_plugins, dict):
    fail("Claude enabledPlugins must be an object")
if enabled_plugins.get("datadog@claude-plugins-official") is not True:
    fail("Claude must enable the official Datadog plugin")

hooks = settings.get("hooks")
if not isinstance(hooks, dict):
    fail("Claude settings hooks must be an object")


def hook_commands_for(event_name: str) -> set[str | None]:
    return {
        hook.get("command")
        for group in hooks.get(event_name, [])
        for hook in group.get("hooks", [])
        if isinstance(hook, dict)
    }


repository_guard_command = "~/.claude/hooks/authorize-repository.sh"
for event_name in ("UserPromptSubmit", "PreToolUse"):
    if repository_guard_command not in hook_commands_for(event_name):
        fail(f"Claude repository authorization must guard {event_name}")

hook_commands = {
    hook.get("command")
    for groups in hooks.values()
    for group in groups
    for hook in group.get("hooks", [])
    if isinstance(hook, dict)
}
for command in (
    "~/.claude/hooks/herdr-review-notify.sh success",
    "~/.claude/hooks/herdr-review-notify.sh failure",
):
    if command in hook_commands:
        fail(f"legacy Herdr review hook remains configured: {command}")

permissions = settings.get("permissions")
if not isinstance(permissions, dict):
    fail("Claude settings permissions must be an object")

required_permissions = {
    "allow": {
        "Bash(git add *)",
        "Bash(git commit *)",
    },
    "ask": {
        "Bash(rm *)",
        "Bash(git reset *)",
        "Bash(git push *)",
        "Bash(gh pr create *)",
        "Bash(gh api *)",
    },
    "deny": {
        "Bash(rm -rf *)",
        "Bash(git push --force *)",
        "Read(**/.env)",
        "Edit(**/.env)",
    },
}
for level, required in required_permissions.items():
    configured = permissions.get(level)
    if not isinstance(configured, list):
        fail(f"Claude permissions.{level} must be a list")
    missing = required - set(configured)
    if missing:
        fail(f"Claude permissions.{level} is missing: {sorted(missing)}")

if "Bash(git *)" in permissions["allow"]:
    fail("Claude permissions.allow must not pre-approve the git namespace")
