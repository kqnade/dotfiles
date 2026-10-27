#!/usr/bin/env python3

import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]


class PluginTests(unittest.TestCase):
    def test_work_profiles_pin_claude_sdk_without_changing_personal_profiles(self):
        override = "  '@deepseek-ai/dsh-subagent-claude-code>@anthropic-ai/claude-agent-sdk': 0.3.309"
        for role in ("personal", "work"):
            for surface in ("tui", "web"):
                with self.subTest(role=role, surface=surface):
                    config = (ROOT / f"dot_dsh/{role}/profiles/{surface}/pnpm-workspace.yaml").read_text()
                    if role == "work":
                        self.assertIn("overrides:\n" + override + "\n", config)
                    else:
                        self.assertNotIn("@anthropic-ai/claude-agent-sdk", config)

    def test_workspace_guard_overlay_requires_activation_before_serving(self):
        work = ROOT / "dot_config/deepseek-harness/work"
        self.assertTrue((work / "workspaces.mjs").is_file())
        overlay = (work / "web-required.patch.yml").read_text()
        self.assertIn("name: './workspaces.mjs'", overlay)
        self.assertIn("- id: webserver\n  inject:\n    - webStartup\n    - dotfilesWorkWorkspacePolicy", overlay)
        self.assertNotIn("workspaces", (ROOT / "dot_config/deepseek-harness/personal/cordis.patch.yml").read_text())

    def test_common_plugins_and_cli_subagent_boundaries(self):
        common = {
            f"@deepseek-ai/dsh-experimental-{name}"
            for name in (
                "agent-team-profile", "auto-review", "tool-worktree",
                "cot-translation-bundle", "terminal-bundle", "session-search",
                "session-titles-bundle", "badge-skill-bundle", "ralph-bundle",
            )
        }
        for role in ("personal", "work"):
            for surface in ("tui", "web"):
                with self.subTest(role=role, surface=surface):
                    template = ROOT / f"dot_dsh/{role}/profiles/{surface}/package.json.tmpl"
                    rendered = subprocess.run(
                        ["chezmoi", "--source", str(ROOT), "execute-template"],
                        input=template.read_text(), capture_output=True, text=True, check=True,
                    )
                    profile = json.loads(rendered.stdout)
                    bundles = profile["dsh"]["profile"]["bundles"]
                    self.assertEqual(len(bundles), len(set(bundles)))
                    self.assertEqual(
                        {name for name in bundles if "dsh-experimental-" in name}, common,
                    )
                    for names in (bundles, profile["dependencies"]):
                        self.assertNotIn("@deepseek-ai/dsh-subagent-codex", names)
                        self.assertEqual(
                            "@deepseek-ai/dsh-subagent-claude-code" in names, role == "work",
                        )


if __name__ == "__main__":
    unittest.main()
