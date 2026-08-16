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
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ValidateMiseTests(unittest.TestCase):
    def test_ci_git_config_keeps_https_clone_urls(self) -> None:
        chezmoi = shutil.which("chezmoi")
        self.assertIsNotNone(chezmoi, "chezmoi must be installed to render git config")

        environment = dict(os.environ)
        environment["CI"] = "true"
        result = subprocess.run(
            [
                chezmoi,
                "--source",
                str(ROOT),
                "execute-template",
                "--file",
                str(ROOT / "dot_gitconfig.tmpl"),
            ],
            env=environment,
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('[url "git@github.com:"]', result.stdout)
        self.assertNotIn('[url "git@gitlab.com:"]', result.stdout)

    def test_codex_usage_exporter_runs_every_minute(self) -> None:
        config = tomllib.loads((ROOT / "mise/config.toml").read_text())

        expected_program = (
            "~/repos/github.com/kqnade/dotfiles/scripts/codex-usage-exporter.sh"
        )

        self.assertEqual(
            config["bootstrap"]["macos"]["launchd"]["agents"][
                "codex-usage-exporter"
            ]["program"],
            expected_program,
        )
        self.assertEqual(
            config["bootstrap"]["macos"]["launchd"]["agents"][
                "codex-usage-exporter"
            ]["start_interval"],
            60,
        )
        self.assertEqual(
            config["bootstrap"]["linux"]["systemd"]["units"][
                "codex-usage-exporter"
            ]["exec_start"],
            expected_program,
        )
        self.assertEqual(
            config["bootstrap"]["linux"]["systemd"]["units"][
                "codex-usage-exporter"
            ]["restart_sec"],
            "60s",
        )

    def test_codex_usage_exporter_resolves_op_outside_systemd_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            home = Path(temporary_directory)
            reads = home / "op-reads"
            op_script = (
                "#!/bin/sh\n"
                'test "$1" = read || exit 98\n'
                f"printf x >> {reads}\n"
                "printf resolved-key\n"
            )
            op = home / ".local/bin/op"
            op.parent.mkdir(parents=True)
            op.write_text(op_script)
            op.chmod(0o755)
            op_exe = home / "op.exe"
            op_exe.write_text(op_script)
            op_exe.chmod(0o755)
            exporter = home / "exporter"
            exporter.write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$NEW_RELIC_ACCOUNT_APIKey\"\n"
            )
            exporter.chmod(0o755)
            op_env = home / ".op.env"
            op_env.write_text("NEW_RELIC_ACCOUNT_APIKey=op://test/item/key\n")

            environment = {
                "HOME": str(home),
                "PATH": "/usr/bin:/bin",
                "XDG_RUNTIME_DIR": str(home / "runtime"),
                "DOTFILES_ROOT": str(ROOT),
                "CODEX_USAGE_OP_ENV": str(op_env),
                "CODEX_USAGE_OP_EXE": str(op_exe),
                "CODEX_USAGE_EXPORTER": str(exporter),
            }
            results = [
                subprocess.run(
                    [str(ROOT / "scripts/codex-usage-exporter.sh")],
                    env=environment,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                for _ in range(2)
            ]
            cache = home / "runtime/codex-usage-exporter/op.env"
            read_count = reads.read_text() if reads.is_file() else ""
            cache_mode = cache.stat().st_mode & 0o777 if cache.is_file() else None

        self.assertEqual([result.returncode for result in results], [0, 0])
        self.assertEqual(
            [result.stdout.strip() for result in results],
            ["resolved-key", "resolved-key"],
        )
        self.assertEqual(read_count, "x")
        self.assertEqual(cache_mode, 0o600)

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
