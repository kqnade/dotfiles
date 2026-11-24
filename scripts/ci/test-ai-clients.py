#!/usr/bin/env python3
"""Check client selection, Claude opt-in, and managed file retirement."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[2]
RETIRED = {
    "aqua:openai/codex",
    "opencode",
    "npm:@deepseek-ai/dsh",
    "npm:@earendil-works/pi-coding-agent",
    "ollama",
    "npm:ccusage",
}


class AIClientTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.config = Path(temporary.name) / "chezmoi.toml"
        self.config.write_text("")

    def render(self, relative, enabled=None, environment=None):
        overrides = {} if enabled is None else {"claude_work_enabled": enabled}
        return subprocess.run(
            [
                "chezmoi",
                "--source",
                str(ROOT),
                "--config",
                str(self.config),
                "--override-data",
                json.dumps(overrides),
                "execute-template",
                "--file",
                str(ROOT / relative),
            ],
            env=environment,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_base_manifest_only_installs_cursor(self):
        tools = tomllib.loads((ROOT / "mise.toml").read_text())["tools"]
        self.assertIn("cursor-agent", tools)
        self.assertNotIn("claude", tools)
        self.assertFalse(RETIRED & tools.keys())

    def test_bootstrap_config_excludes_existing_global_tools(self):
        result = subprocess.run(
            ["mise", "-C", str(ROOT), "config", "ls", "--json"],
            env={**os.environ, "MISE_CONFIG_DIR": str(ROOT / "mise"), "MISE_ENV": ""},
            text=True, capture_output=True, check=True,
        )
        configs = json.loads(result.stdout)
        self.assertEqual({Path(config["path"]).resolve() for config in configs},
                         {ROOT / "mise.toml", ROOT / "mise/config.toml"})
        tools = {tool for config in configs for tool in config["tools"]}
        self.assertNotIn("claude", tools)
        self.assertIn("cursor-agent", tools)
        self.assertFalse(RETIRED & tools)

    def test_claude_is_only_in_the_opt_in_manifest(self):
        tools = tomllib.loads((ROOT / "mise.work.toml").read_text())["tools"]
        self.assertEqual(set(tools), {"claude"})
        self.assertIsInstance(tools["claude"]["version"], str)

    def test_rendered_mise_config_selects_claude_explicitly(self):
        for enabled in (False, True):
            with self.subTest(enabled=enabled):
                result = self.render("dot_config/mise/config.toml.tmpl", enabled)
                self.assertEqual(result.returncode, 0, result.stderr)
                rendered = tomllib.loads(result.stdout)
                self.assertIs(rendered["settings"]["lockfile"], False)
                tools = rendered["tools"]
                self.assertEqual("claude" in tools, enabled)
                self.assertIn("cursor-agent", tools)
                self.assertFalse(RETIRED & tools.keys())
                self.assertFalse((ROOT / "dot_config/mise/mise.lock.tmpl").exists())
                lock_tools = set(tomllib.loads((ROOT / "mise.lock").read_text())["tools"])
                if enabled:
                    lock_tools.update(tomllib.loads((ROOT / "mise.work.lock").read_text())["tools"])
                self.assertEqual(lock_tools, set(tools))

    def test_claude_files_are_opt_in_on_macos_and_linux(self):
        for os_name in ("darwin", "linux"):
            for enabled in (False, True):
                with (
                    self.subTest(os_name=os_name, enabled=enabled),
                    tempfile.TemporaryDirectory() as home,
                ):
                    result = subprocess.run(
                        [
                            "chezmoi",
                            "--source",
                            str(ROOT),
                            "--destination",
                            home,
                            "--override-data",
                            json.dumps(
                                {
                                    "claude_work_enabled": enabled,
                                    "chezmoi": {
                                        "os": os_name,
                                        "kernel": {"osrelease": "generic"},
                                    },
                                }
                            ),
                            "managed",
                            "--path-style=relative",
                        ],
                        text=True,
                        capture_output=True,
                        check=True,
                    )
                    managed = result.stdout.splitlines()
                    self.assertEqual(".claude/settings.json" in managed, enabled)
                    if not enabled:
                        self.assertFalse(any(path == ".claude" or path.startswith(".claude/") for path in managed))
                    self.assertFalse(
                        any(
                            path.startswith(
                                (
                                    ".pi/",
                                    ".codex/",
                                    ".dsh/",
                                    ".config/opencode/",
                                    ".config/deepseek-harness/",
                                )
                            )
                            for path in managed
                        )
                    )

    def test_disabled_claude_updates_an_existing_imported_authorization_hook(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary).resolve()
            guard = home / ".claude/hooks/authorize-repository.sh"
            guard.parent.mkdir(parents=True)
            guard.write_text("#!/bin/bash\nexit 2\n")
            settings = home / ".claude/settings.json"
            original = '{"hooks":{"PreToolUse":[{"hooks":[{"command":"~/.claude/hooks/authorize-repository.sh"}]}]},"runtime":"preserve"}'
            settings.write_text(original)
            for _ in range(2):
                result = subprocess.run(
                    ["chezmoi", "--source", str(ROOT), "--destination", str(home),
                     "--override-data", '{"claude_work_enabled":false}',
                     "--persistent-state", str(home / "state.boltdb"), "--no-tty", "apply", str(guard)],
                    text=True, capture_output=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(guard.read_bytes(), (ROOT / "dot_claude/hooks/executable_authorize-repository.sh").read_bytes())
                self.assertEqual(settings.read_text(), original)
                self.assertFalse((guard.parent / "notify.sh").exists())
                cursor = subprocess.run(
                    ["bash", str(guard)], cwd=home,
                    input=json.dumps({"hook_event_name": "preToolUse", "cursor_version": "3.0.0"}),
                    text=True, capture_output=True,
                )
                self.assertEqual(cursor.returncode, 0, cursor.stderr)

    def test_opt_in_defaults_off_and_rejects_non_boolean_values(self):
        result = self.render(".chezmoitemplates/claude-work-enabled.tmpl")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "false")
        for value in ("true", 1, []):
            with self.subTest(value=value):
                result = self.render(
                    ".chezmoitemplates/claude-work-enabled.tmpl", value
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("must be a boolean", result.stderr)

    def test_install_environment_overrides_and_persists_the_selection(self):
        environment = {**os.environ, "DOTFILES_CLAUDE_WORK_ENABLED": "true"}
        result = self.render(".chezmoi.toml.tmpl", False, environment)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIs(tomllib.loads(result.stdout)["data"]["claude_work_enabled"], True)
        result = self.render(
            ".chezmoi.toml.tmpl",
            True,
            {**environment, "DOTFILES_CLAUDE_WORK_ENABLED": ""},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIs(tomllib.loads(result.stdout)["data"]["claude_work_enabled"], True)
        result = self.render(
            ".chezmoi.toml.tmpl",
            False,
            {**environment, "DOTFILES_CLAUDE_WORK_ENABLED": "yes"},
        )
        self.assertNotEqual(result.returncode, 0)

    def test_repeated_chezmoi_init_preserves_the_opt_in(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            config = home / "config/chezmoi.toml"
            config.parent.mkdir()
            environment = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / "config"),
                           "XDG_DATA_HOME": str(home / "data"), "XDG_CACHE_HOME": str(home / "cache")}
            for value, expected in (("true", True), ("", True), ("false", False), ("", False)):
                result = subprocess.run(
                    ["chezmoi", "--source", str(ROOT), "--destination", str(home),
                     "--config", str(config), "--persistent-state", str(home / "state.boltdb"),
                     "--no-tty", "init"],
                    env={**environment, "DOTFILES_CLAUDE_WORK_ENABLED": value},
                    text=True, capture_output=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIs(tomllib.loads(config.read_text())["data"]["claude_work_enabled"], expected)

    def test_only_skk_services_remain_managed(self):
        bootstrap = tomllib.loads((ROOT / "mise/config.toml").read_text())["bootstrap"]
        self.assertEqual(set(bootstrap["macos"]["launchd"]["agents"]), {"yaskkserv2"})
        self.assertEqual(set(bootstrap["linux"]["systemd"]["units"]), {"yaskkserv2"})


if __name__ == "__main__":
    unittest.main()
