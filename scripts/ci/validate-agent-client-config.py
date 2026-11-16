#!/usr/bin/env python3
"""Validate Claude settings and repository authorization invariants."""

import json
import subprocess

from validate_common import ROOT, fail

try:
    rendered = subprocess.check_output(
        [
            "chezmoi",
            "--source",
            str(ROOT),
            "execute-template",
            "--file",
            str(ROOT / ".chezmoitemplates/claude-settings.json.tmpl"),
        ],
        text=True,
    )
    settings = json.loads(rendered)
except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
    fail(f"invalid Claude settings JSON: {error}")

if settings.get("autoMemoryEnabled") is not False:
    fail("Claude automatic memory must remain disabled")

hooks = settings.get("hooks")
if not isinstance(hooks, dict):
    fail("Claude settings hooks must be an object")

for event in ("UserPromptSubmit", "PreToolUse"):
    commands = {
        hook.get("command")
        for group in hooks.get(event, [])
        for hook in group.get("hooks", [])
        if isinstance(hook, dict)
    }
    if "~/.claude/hooks/authorize-repository.sh" not in commands:
        fail(f"Claude repository authorization must guard {event}")

permissions = settings.get("permissions")
if not isinstance(permissions, dict):
    fail("Claude settings permissions must be an object")

required_permissions = {
    "allow": {"Bash(git add *)", "Bash(git commit *)"},
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
