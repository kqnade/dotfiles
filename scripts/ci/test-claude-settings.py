#!/usr/bin/env python3

"""Regression tests for Claude settings serialization stability."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ClaudeSettingsTests(unittest.TestCase):
    def settings_for(self, os_name: str) -> dict:
        result = subprocess.run(
            [
                "chezmoi",
                "--source",
                str(ROOT),
                "--override-data",
                json.dumps({"chezmoi": {"os": os_name}}),
                "execute-template",
                "--file",
                str(ROOT / ".chezmoitemplates/claude-settings.json.tmpl"),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_macos_apply_preserves_runtime_hooks_and_fullscreen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            target = home / ".claude/settings.json"
            target.parent.mkdir()
            orca_hooks = {"Stop": [{"hooks": [{"command": "orca-hook"}]}]}
            target.write_text(
                json.dumps({
                    "hooks": orca_hooks,
                    "tui": "fullscreen",
                    "model": "opus[1m]",
                })
            )
            command = [
                "chezmoi",
                "--source", str(ROOT),
                "--destination", str(home),
                "--override-data", json.dumps({"chezmoi": {"os": "darwin"}}),
                "--persistent-state", str(home / "state.boltdb"),
                "--no-tty",
                "apply", str(target),
            ]
            for _ in range(2):
                result = subprocess.run(
                    command, text=True, capture_output=True, check=False
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                settings = json.loads(target.read_text())
                self.assertEqual(settings["hooks"]["Stop"], orca_hooks["Stop"])
                self.assertEqual(settings["tui"], "fullscreen")
                self.assertEqual(settings["model"], "claude-opus-5-5[1m]")
                self.assertEqual(settings["theme"], "dark-daltonize")
                self.assertIn("PreToolUse", settings["hooks"])

    def test_linux_modifier_keeps_canonical_herdr_hook(self) -> None:
        script = subprocess.check_output(
            [
                "chezmoi", "--source", str(ROOT),
                "--override-data", json.dumps({"chezmoi": {"os": "linux"}}),
                "execute-template", "--file",
                str(ROOT / "dot_claude/modify_settings.json.tmpl"),
            ],
            text=True,
        )
        result = subprocess.run(
            ["bash", "-c", script],
            input='{"hooks":{"Stop":[]},"tui":"fullscreen"}',
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(result.stdout), self.settings_for("linux"))

    def test_default_permission_mode_is_auto(self) -> None:
        self.assertEqual(
            self.settings_for("darwin")["permissions"]["defaultMode"], "auto"
        )

    def test_output_style_is_concise(self) -> None:
        self.assertEqual(self.settings_for("darwin").get("outputStyle"), "Concise")

    def test_top_level_keys_are_sorted_for_herdr_stability(self) -> None:
        settings = self.settings_for("linux")
        self.assertEqual(list(settings), sorted(settings))

    def test_herdr_session_hook_matches_installer_serialization(self) -> None:
        settings = self.settings_for("linux")
        hook = settings["hooks"]["SessionStart"][1]

        self.assertEqual(len(self.settings_for("darwin")["hooks"]["SessionStart"]), 1)
        self.assertEqual(list(hook), ["matcher", "hooks"])
        self.assertEqual(hook["matcher"], "^(startup|resume|clear|compact|fork)$")
        self.assertEqual(list(hook["hooks"][0]), ["type", "command", "timeout"])


if __name__ == "__main__":
    unittest.main()
