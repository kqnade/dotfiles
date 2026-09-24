#!/usr/bin/env python3

"""Regression tests for Claude settings serialization stability."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ClaudeSettingsTests(unittest.TestCase):
    def test_default_permission_mode_is_auto(self) -> None:
        template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
        settings = json.loads(template.split("{{-", 1)[0])

        self.assertEqual(settings["permissions"]["defaultMode"], "auto")

    def test_output_style_is_concise(self) -> None:
        template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
        settings = json.loads(template.split("{{-", 1)[0])

        self.assertEqual(settings.get("outputStyle"), "Concise")

    def test_top_level_keys_are_sorted_for_herdr_stability(self) -> None:
        template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
        settings = json.loads(template.split("{{-", 1)[0])

        self.assertEqual(list(settings), sorted(settings))

    def test_herdr_session_hook_matches_installer_serialization(self) -> None:
        template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
        settings = json.loads(template.split("{{-", 1)[0])
        hook = settings["hooks"]["SessionStart"][1]

        self.assertEqual(list(hook), ["matcher", "hooks"])
        self.assertEqual(hook["matcher"], "^(startup|resume|clear|compact|fork)$")
        self.assertEqual(list(hook["hooks"][0]), ["type", "command", "timeout"])


if __name__ == "__main__":
    unittest.main()
