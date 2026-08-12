#!/usr/bin/env python3

"""Regression tests for the mise manifest and lockfile validator."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ValidateMiseTests(unittest.TestCase):
    def test_repository_loads_split_manifest(self) -> None:
        mise = shutil.which("mise")
        self.assertIsNotNone(mise, "mise must be installed to validate config discovery")

        with tempfile.TemporaryDirectory() as temporary_directory:
            environment = dict(os.environ)
            environment["MISE_CONFIG_DIR"] = temporary_directory
            environment["MISE_CACHE_DIR"] = str(
                Path(temporary_directory) / "cache"
            )
            environment["MISE_STATE_DIR"] = str(
                Path(temporary_directory) / "state"
            )
            trust = subprocess.run(
                [mise, "trust", str(ROOT / "mise.toml")],
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(trust.returncode, 0, trust.stderr)
            result = subprocess.run(
                [mise, "-C", str(ROOT), "config", "ls", "--json"],
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            user_status = subprocess.run(
                [
                    mise,
                    "-C",
                    str(ROOT),
                    "bootstrap",
                    "user",
                    "status",
                    "--json",
                ],
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        loaded_paths = {Path(item["path"]) for item in json.loads(result.stdout)}
        self.assertEqual(
            loaded_paths,
            {ROOT / "mise.toml", ROOT / "mise/config.toml"},
        )
        self.assertEqual(user_status.returncode, 0, user_status.stderr)
        self.assertEqual(
            json.loads(user_status.stdout)["login_shell"]["shell"],
            "/bin/zsh",
        )

    def test_rendered_global_config_preserves_split_manifest_behavior(self) -> None:
        mise = shutil.which("mise")
        chezmoi = shutil.which("chezmoi")
        self.assertIsNotNone(mise, "mise must be installed to validate config behavior")
        self.assertIsNotNone(
            chezmoi, "chezmoi must be installed to validate the rendered config"
        )

        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            config_dir = fixture_root / "config"
            config_dir.mkdir()
            render = subprocess.run(
                [
                    chezmoi,
                    "--source",
                    str(ROOT),
                    "execute-template",
                    "--file",
                    str(ROOT / "dot_config/mise/config.toml.tmpl"),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(render.returncode, 0, render.stderr)
            (config_dir / "config.toml").write_text(render.stdout)

            environment = dict(os.environ)
            environment.update(
                MISE_CACHE_DIR=str(fixture_root / "cache"),
                MISE_CONFIG_DIR=str(config_dir),
                MISE_STATE_DIR=str(fixture_root / "state"),
            )
            node = subprocess.run(
                [mise, "-C", str(fixture_root), "config", "get", "tools.node"],
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            login_shell = subprocess.run(
                [
                    mise,
                    "-C",
                    str(fixture_root),
                    "config",
                    "get",
                    "bootstrap.user.login_shell",
                ],
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            tasks = subprocess.run(
                [mise, "-C", str(fixture_root), "tasks", "ls", "--json"],
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(node.returncode, 0, node.stderr)
        self.assertEqual(node.stdout.strip(), "26.7.0")
        self.assertEqual(login_shell.returncode, 0, login_shell.stderr)
        self.assertEqual(login_shell.stdout.strip(), "/bin/zsh")
        self.assertEqual(tasks.returncode, 0, tasks.stderr)
        self.assertEqual(
            {task["name"] for task in json.loads(tasks.stdout)},
            {"apply", "bootstrap", "doctor", "format", "pre-commit"},
        )

    def test_bootstrap_fragment_is_not_a_home_directory_target(self) -> None:
        chezmoi = shutil.which("chezmoi")
        self.assertIsNotNone(chezmoi, "chezmoi must be installed to inspect targets")

        with tempfile.TemporaryDirectory() as temporary_directory:
            destination = Path(temporary_directory)
            result = subprocess.run(
                [
                    chezmoi,
                    "--source",
                    str(ROOT),
                    "--destination",
                    str(destination),
                    "managed",
                    "--path-style=absolute",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        managed_paths = {Path(path) for path in result.stdout.splitlines()}
        self.assertNotIn(destination / "mise/config.toml", managed_paths)

    def test_requested_version_must_own_each_locked_platform_url(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            for relative in (
                "mise.toml",
                "mise/config.toml",
                "mise.lock",
                "dot_config/mise/config.toml.tmpl",
                "dot_config/mise/mise.lock.tmpl",
                "scripts/ci/validate-mise.py",
            ):
                source = ROOT / relative
                destination = fixture_root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)

            manifest = fixture_root / "mise.toml"
            manifest_text, replacement_count = re.subn(
                r'(?m)^1password-cli = "[^"]+"$',
                '1password-cli = "999.0.0"',
                manifest.read_text(),
            )
            self.assertEqual(replacement_count, 1)
            manifest.write_text(manifest_text)

            lockfile = fixture_root / "mise.lock"
            lockfile.write_text(
                lockfile.read_text()
                + '\n[[tools.1password-cli]]\nversion = "999.0.0"\n'
                + 'backend = "vfox:1password-cli"\n'
            )

            result = subprocess.run(
                [sys.executable, str(fixture_root / "scripts/ci/validate-mise.py")],
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "1password-cli@999.0.0 has no locked URL for macos-arm64",
            result.stderr,
        )


if __name__ == "__main__":
    unittest.main()
