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

from validate_common import strip_json_comments


ROOT = Path(__file__).resolve().parents[2]


class ValidateMiseTests(unittest.TestCase):
    def test_ci_validates_lockfile_before_mise_can_refresh_it(self) -> None:
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        static_job = workflow.split("  static:", 1)[1].split(
            "  package-bootstrap:", 1
        )[0]
        validation = "          python3 scripts/ci/validate-mise.py\n"
        self.assertIn(validation, static_job)
        for command in ("mise trust mise.toml", "mise install", "mise exec"):
            self.assertLess(static_job.index(validation), static_job.index(command))

    def test_github_binary_release_tags_use_lockfile_version_format(self) -> None:
        config = json.loads(
            strip_json_comments((ROOT / "renovate.jsonc").read_text())
        )
        for package, version in (("pnpm/pnpm", "12.12.1"), ("atuinsh/atuin", "18.24.1")):
            with self.subTest(package=package):
                rules = [
                    rule
                    for rule in config["packageRules"]
                    if rule.get("matchManagers") == ["mise"]
                    and rule.get("matchDatasources") == ["github-releases"]
                    and package in rule.get("matchPackageNames", [])
                ]
                self.assertEqual(len(rules), 1)
                rule = rules[0]
                self.assertEqual(rule.get("versioning"), "semver")
                pattern = re.compile(
                    rule["extractVersion"].replace("(?<version>", "(?P<version>")
                )
                for tag in (f"v{version}", version):
                    match = pattern.fullmatch(tag)
                    self.assertIsNotNone(match)
                    self.assertEqual(match.group("version"), version)
                self.assertIsNone(pattern.fullmatch(f"v{version}-rc.1"))

    def test_yaskkserv2_master_updates_both_revision_pins(self) -> None:
        config = json.loads(
            strip_json_comments((ROOT / "renovate.jsonc").read_text())
        )
        managers = config.get("customManagers", [])
        self.assertEqual(len(managers), 1)
        manager = managers[0]
        self.assertEqual(manager["customType"], "regex")
        self.assertEqual(manager["managerFilePatterns"], [r"/^mise\.(toml|lock)$/"])
        self.assertEqual(manager["depNameTemplate"], "wachikun/yaskkserv2")
        self.assertEqual(manager["packageNameTemplate"], "wachikun/yaskkserv2")
        self.assertEqual(manager["datasourceTemplate"], "github-digest")
        self.assertEqual(manager["currentValueTemplate"], "master")
        self.assertEqual(manager["versioningTemplate"], "exact")
        self.assertTrue(any(
            rule.get("matchManagers") == ["mise"]
            and rule.get("matchDepNames") == [
                "cargo:https://github.com/wachikun/yaskkserv2"
            ]
            and rule.get("enabled") is False
            for rule in config["packageRules"]
        ))

        tool = "cargo:https://github.com/wachikun/yaskkserv2"
        manifest = tomllib.loads((ROOT / "mise.toml").read_text())
        current_digest = manifest["tools"][tool]["version"].removeprefix("rev:")
        new_digest = "a" * 40
        for relative in ("mise.toml", "mise.lock"):
            with self.subTest(file=relative):
                content = (ROOT / relative).read_text()
                matches = [
                    match
                    for pattern in manager["matchStrings"]
                    for match in re.finditer(
                        pattern.replace("(?<currentDigest>", "(?P<currentDigest>"),
                        content,
                    )
                ]
                self.assertEqual(len(matches), 1)
                match = matches[0]
                self.assertEqual(match.group("currentDigest"), current_digest)
                start, end = match.span("currentDigest")
                updated = content[:start] + new_digest + content[end:]
                entry = tomllib.loads(updated)["tools"][tool]
                if relative == "mise.lock":
                    entry = entry[0]
                self.assertEqual(entry["version"], f"rev:{new_digest}")

    def test_1password_lock_resolves_official_archives_without_warnings(self) -> None:
        mise = shutil.which("mise")
        self.assertIsNotNone(mise)
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            shutil.copyfile(ROOT / "mise.toml", fixture_root / "mise.toml")
            environment = {
                **os.environ,
                "MISE_CONFIG_DIR": str(fixture_root / "config"),
            }
            result = subprocess.run(
                [mise, "trust", str(fixture_root / "mise.toml")],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run(
                [mise, "lock", "1password-cli"],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("WARN", result.stderr)
            lock = tomllib.loads((fixture_root / "mise.lock").read_text())

        entry = lock["tools"]["1password-cli"][0]
        version = entry["version"]
        for platform, archive_platform in (
            ("macos-arm64", "darwin_arm64"),
            ("macos-x64", "darwin_amd64"),
            ("linux-x64", "linux_amd64"),
        ):
            with self.subTest(platform=platform):
                self.assertEqual(
                    entry[f"platforms.{platform}"]["url"],
                    f"https://cache.agilebits.com/dist/1P/op2/pkg/v{version}/"
                    f"op_{archive_platform}_v{version}.zip",
                )

    def test_os_filtered_tools_lock_supported_platforms_without_warnings(self) -> None:
        mise = shutil.which("mise")
        self.assertIsNotNone(mise)
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            for name in ("mise.toml", "mise.lock"):
                shutil.copyfile(ROOT / name, fixture_root / name)
            environment = {
                **os.environ,
                "MISE_CONFIG_DIR": str(fixture_root / "config"),
                "MISE_STATE_DIR": str(fixture_root / "state"),
            }
            result = subprocess.run(
                [mise, "trust", str(fixture_root / "mise.toml")],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run(
                [mise, "lock", "btop", "delta", "sheldon"],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("is not available for", result.stderr)
            lock = tomllib.loads((fixture_root / "mise.lock").read_text())

        platforms = {
            "-".join(key.removeprefix("platforms.").split("-")[:2])
            for entries in lock["tools"].values()
            for entry in entries
            for key in entry
            if key.startswith("platforms.")
        }
        self.assertEqual(platforms, {"linux-x64", "macos-arm64", "macos-x64"})
        for tool, expected in (
            ("btop", {"linux-x64"}),
            ("delta", {"linux-x64", "macos-arm64"}),
            ("sheldon", {"linux-x64", "macos-arm64"}),
        ):
            with self.subTest(tool=tool):
                actual = {
                    "-".join(key.removeprefix("platforms.").split("-")[:2])
                    for entry in lock["tools"][tool]
                    for key in entry
                    if key.startswith("platforms.")
                }
                self.assertEqual(actual, expected)

    def test_1password_uses_http_backend(self) -> None:
        manifest = tomllib.loads((ROOT / "mise.toml").read_text())
        self.assertEqual(manifest["tool_alias"]["1password-cli"], "http:1password-cli")
        version = manifest["tools"]["1password-cli"]["version"]
        lock = tomllib.loads((ROOT / "mise.lock").read_text())
        entries = [
            entry
            for entry in lock["tools"]["1password-cli"]
            if entry["version"] == version
        ]
        self.assertTrue(entries)
        for entry in entries:
            self.assertEqual(entry["backend"], "http:1password-cli")

    def test_node_tooling_uses_pnpm_without_bun(self) -> None:
        tools = tomllib.loads((ROOT / "mise.toml").read_text())["tools"]
        self.assertIn("github:pnpm/pnpm", tools)
        self.assertNotIn("bun", tools)
        lock = tomllib.loads((ROOT / "mise.lock").read_text())
        self.assertNotIn("bun", lock["tools"])
        for name in ("dot_zshrc", "dot_bashrc.tmpl"):
            with self.subTest(file=name):
                self.assertNotIn("$HOME/.bun/bin", (ROOT / name).read_text())

    def test_mise_exec_uses_python_with_tomllib(self) -> None:
        mise = shutil.which("mise")
        self.assertIsNotNone(mise)

        with tempfile.TemporaryDirectory() as temporary_directory:
            python3 = Path(temporary_directory) / "python3"
            python3.write_text("#!/bin/sh\nexit 42\n")
            python3.chmod(0o755)
            result = subprocess.run(
                [mise, "exec", "--", "python3", "-c", "import tomllib"],
                cwd=ROOT,
                env={**os.environ, "PATH": f"{temporary_directory}:{os.environ['PATH']}"},
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)

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
        manifest = tomllib.loads((ROOT / "mise.toml").read_text())
        self.assertEqual(node.stdout.strip(), manifest["tools"]["node"])
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

    def test_herdr_dotfiles_are_linux_only(self) -> None:
        chezmoi = shutil.which("chezmoi")
        self.assertIsNotNone(chezmoi)

        with tempfile.TemporaryDirectory() as temporary_directory:
            destination = Path(temporary_directory)
            for os_name in ("darwin", "linux"):
                result = subprocess.run(
                    [
                        chezmoi,
                        "--source",
                        str(ROOT),
                        "--destination",
                        str(destination),
                        "--override-data",
                        json.dumps(
                            {"chezmoi": {"os": os_name, "kernel": {"osrelease": "generic"}}}
                        ),
                        "managed",
                        "--path-style=absolute",
                    ],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                managed = set(result.stdout.splitlines())
                for relative in (
                    ".config/herdr",
                    ".config/herdr/config.toml",
                    ".local/bin/herdr-worktree",
                ):
                    self.assertEqual(
                        str(destination / relative) in managed, os_name == "linux"
                    )

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
            version = tomllib.loads(manifest.read_text())["tools"]["1password-cli"]["version"]
            manifest_text, replacement_count = re.subn(
                rf'(?m)^(1password-cli = \{{ version = )"{re.escape(version)}"',
                r'\g<1>"999.0.0"',
                manifest.read_text(),
            )
            self.assertEqual(replacement_count, 1)
            manifest.write_text(manifest_text)

            lockfile = fixture_root / "mise.lock"
            lockfile.write_text(
                lockfile.read_text()
                + '\n[[tools.1password-cli]]\nversion = "999.0.0"\n'
                + 'backend = "http:1password-cli"\n'
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
