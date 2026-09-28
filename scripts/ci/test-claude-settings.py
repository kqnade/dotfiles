#!/usr/bin/env python3

"""Regression tests for Claude settings serialization stability."""

from __future__ import annotations

import json
import subprocess
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
                str(ROOT / "dot_claude/settings.json.tmpl"),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

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
