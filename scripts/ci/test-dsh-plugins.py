#!/usr/bin/env python3

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class PluginTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)

    def render(self, path):
        return subprocess.check_output(
            ["chezmoi", "--source", str(ROOT), "--destination", str(self.home),
             "--config", str(self.home / "chezmoi.toml"),
             "execute-template", "--file", str(ROOT / path)],
            env=dict(os.environ, HOME=str(self.home),
                     XDG_CONFIG_HOME=str(self.home / ".config"),
                     XDG_CACHE_HOME=str(self.home / ".cache"),
                     XDG_DATA_HOME=str(self.home / ".local/share")),
            text=True,
        )

    def workspace(self, role, surface):
        return json.loads(subprocess.check_output(
            ["yq", "-o=json", "."],
            input=self.render(f"dot_dsh/{role}/profiles/{surface}/pnpm-workspace.yaml.tmpl"),
            text=True,
        ))

    def test_work_profiles_pin_claude_sdk_without_changing_personal_profiles(self):
        dependency = "@deepseek-ai/dsh-subagent-claude-code>@anthropic-ai/claude-agent-sdk"
        for role in ("personal", "work"):
            for surface in ("tui", "web"):
                with self.subTest(role=role, surface=surface):
                    overrides = self.workspace(role, surface).get("overrides", {})
                    self.assertEqual(overrides, {dependency: "0.3.309"} if role == "work" else {})

    def test_workspace_build_permissions_are_shared(self):
        for role in ("personal", "work"):
            for surface in ("tui", "web"):
                with self.subTest(role=role, surface=surface):
                    self.assertEqual(self.workspace(role, surface)["allowBuilds"], {
                        "@deepseek-ai/dsh-subprocess-local": True,
                        "@google/genai": False,
                        "koffi": True,
                        "node-pty": True,
                        "protobufjs": False,
                    })

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
                    profile = json.loads(self.render(f"dot_dsh/{role}/profiles/{surface}/package.json.tmpl"))
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
