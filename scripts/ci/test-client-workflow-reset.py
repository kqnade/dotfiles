#!/usr/bin/env python3

"""Verify that the managed workflow reset removes only known client targets."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ClientWorkflowResetTests(unittest.TestCase):
    def test_sources_have_no_shared_workflow_or_client_links(self) -> None:
        self.assertFalse((ROOT / "dot_agents").exists())
        self.assertFalse((ROOT / "dot_claude/skills").exists())
        self.assertFalse((ROOT / "dot_codex/agents").exists())
        self.assertFalse((ROOT / "dot_codex/symlink_AGENTS.md").exists())
        self.assertFalse((ROOT / "dot_config/opencode/symlink_AGENTS.md").exists())
        codex_modifier = (ROOT / "dot_codex/modify_private_config.toml").read_text()
        self.assertNotIn(".agents.default_subagent_model =", codex_modifier)
        self.assertEqual(
            {path.name for path in (ROOT / "dot_claude/rules").iterdir()},
            {"operations.md"},
        )

    def test_reset_removes_known_targets_but_preserves_unknown_home_files(self) -> None:
        chezmoi = subprocess.check_output(
            ["mise", "which", "chezmoi"], text=True
        ).strip()
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory).resolve()
            home = temporary / "home"
            home.mkdir()
            old_targets = {
                ".agents/rules/coding.md": "old shared rule\n",
                ".agents/skills/assumption-pruning/SKILL.md": "old skill\n",
                ".agents/skills/context-handoff/scripts/context-candidates": "old helper\n",
                ".claude/skills/assumption-pruning": "old Claude link\n",
                ".claude/rules/delivery.md": "old Claude rule\n",
                ".codex/AGENTS.md": "old Codex rules\n",
                ".codex/agents/luna-parallelizer.toml": "old Codex agent\n",
                ".config/opencode/AGENTS.md": "old OpenCode rules\n",
            }
            for relative, contents in old_targets.items():
                target = home / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(contents)
            claude_link = home / ".claude/skills/assumption-pruning"
            claude_link.unlink()
            claude_link.symlink_to("../../.agents/skills/assumption-pruning")
            preserved = {
                ".agents/rules/user.md": "user rule\n",
                ".agents/skills/user/SKILL.md": "user skill\n",
                ".agents/skills/assumption-pruning/user.md": "user notes\n",
                ".claude/rules/user.md": "user Claude rule\n",
                ".codex/agents/user.toml": "user Codex agent\n",
                ".config/opencode/user.md": "user OpenCode file\n",
                ".config/herdr/user.toml": "user Herdr file\n",
            }
            for relative, contents in preserved.items():
                target = home / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(contents)

            environment = os.environ.copy()
            environment.update(
                {
                    "HOME": str(home),
                    "XDG_CACHE_HOME": str(temporary / "cache"),
                    "XDG_CONFIG_HOME": str(temporary / "config"),
                    "XDG_DATA_HOME": str(temporary / "data"),
                }
            )
            result = subprocess.run(
                [
                    chezmoi,
                    "--source",
                    str(ROOT),
                    "--destination",
                    str(home),
                    "--persistent-state",
                    str(temporary / "state.boltdb"),
                    "--no-tty",
                    "apply",
                ],
                cwd=home,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            for relative in old_targets:
                self.assertFalse(os.path.lexists(home / relative), relative)
            for relative, contents in preserved.items():
                self.assertEqual((home / relative).read_text(), contents, relative)

    def test_codex_migration_preserves_runtime_state(self) -> None:
        yq = subprocess.check_output(["mise", "which", "yq"], text=True).strip()
        environment = os.environ.copy()
        environment["PATH"] = str(Path(yq).parent) + os.pathsep + environment["PATH"]
        environment.pop("NEW_RELIC_LICENSE_KEY", None)
        config = '''
[agents]
max_concurrent_threads_per_session = 8
default_subagent_model = "gpt-5.6-luna"
default_subagent_reasoning_effort = "max"
[agents.user]
config_file = "agents/user.toml"
[projects."/user/project"]
trust_level = "trusted"
'''
        result = subprocess.run(
            ["bash", str(ROOT / "dot_codex/modify_private_config.toml")],
            input=config, text=True, capture_output=True, env=environment, check=True,
        )
        rendered = tomllib.loads(result.stdout)
        self.assertEqual(rendered["agents"], {"user": {"config_file": "agents/user.toml"}})
        self.assertEqual(rendered["projects"]["/user/project"]["trust_level"], "trusted")

    def test_operational_settings_and_authorization_remain(self) -> None:
        settings = json.loads(
            (ROOT / "dot_claude/settings.json.tmpl").read_text().split("{{-", 1)[0]
        )
        self.assertEqual(settings["model"], "opus[1m]")
        self.assertEqual(settings["preferredNotifChannel"], "notifications_disabled")
        commands = {
            hook["command"]
            for groups in settings["hooks"].values()
            for group in groups
            for hook in group["hooks"]
        }
        self.assertIn("~/.claude/hooks/authorize-repository.sh", commands)
        self.assertIn("~/.claude/hooks/notify.sh", commands)


if __name__ == "__main__":
    unittest.main()
