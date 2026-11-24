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
    def test_github_binary_release_tags_use_lockfile_version_format(self) -> None:
        config = json.loads(
            strip_json_comments((ROOT / "renovate.jsonc").read_text())
        )
        rules = [
            rule
            for rule in config["packageRules"]
            if rule.get("matchManagers") == ["mise"]
            and rule.get("matchDatasources") == ["github-releases"]
            and "extractVersion" in rule
        ]
        self.assertEqual(len(rules), 1)
        rule = rules[0]
        self.assertNotIn("matchPackageNames", rule)
        self.assertEqual(rule.get("versioning"), "semver")
        dep_patterns = [
            re.compile(pattern[1:-1])
            for pattern in rule.get("matchDepNames", [])
            if pattern.startswith("/") and pattern.endswith("/")
        ]
        self.assertTrue(dep_patterns)

        def matches_dep(dep_name: str) -> bool:
            return any(pattern.search(dep_name) for pattern in dep_patterns)

        tools = tomllib.loads((ROOT / "mise.toml").read_text())["tools"]
        github_tools = [name for name in tools if name.startswith("github:")]
        self.assertIn("github:sharkdp/fd", github_tools)
        self.assertIn("github:pnpm/pnpm", github_tools)
        self.assertIn("github:atuinsh/atuin", github_tools)
        for name in github_tools:
            with self.subTest(dep=name):
                self.assertTrue(matches_dep(name))
        for name in tools:
            if name.startswith("github:"):
                continue
            with self.subTest(dep=name):
                self.assertFalse(matches_dep(name))

        version_pattern = re.compile(
            rule["extractVersion"].replace("(?<version>", "(?P<version>")
        )
        for version in ("10.5.2", "12.12.1", "18.24.1"):
            with self.subTest(version=version):
                for tag in (f"v{version}", version):
                    match = version_pattern.fullmatch(tag)
                    self.assertIsNotNone(match)
                    self.assertEqual(match.group("version"), version)
                self.assertIsNone(version_pattern.fullmatch(f"v{version}-rc.1"))

    def test_yaskkserv2_master_updates_both_revision_pins(self) -> None:
        config = json.loads(
            strip_json_comments((ROOT / "renovate.jsonc").read_text())
        )
        manager = next(
            manager for manager in config["customManagers"]
            if manager.get("depNameTemplate") == "wachikun/yaskkserv2"
        )

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

    def test_mise_release_pin_tracks_version_and_asset_checksums(self) -> None:
        config = json.loads(
            strip_json_comments((ROOT / "renovate.jsonc").read_text())
        )
        manifest_version = tomllib.loads((ROOT / "mise.toml").read_text())["min_version"]
        self.assertEqual(config["constraints"]["mise"], manifest_version)
        installer = (ROOT / "install.sh").read_text()
        managers = [
            manager for manager in config["customManagers"]
            if str(manager.get("depNameTemplate", "")).startswith("jdx/mise")
        ]
        self.assertEqual(
            {manager["depNameTemplate"] for manager in managers},
            {"jdx/mise", "jdx/mise-linux-x64", "jdx/mise-macos-arm64", "jdx/mise-macos-x64"},
        )
        grouped = [
            rule for rule in config["packageRules"]
            if rule.get("groupName") == "mise"
        ]
        self.assertEqual(len(grouped), 1)
        self.assertIsNone(grouped[0].get("minimumReleaseAge"))
        sources = {
            "jdx/mise": {
                "install.sh": installer,
                "mise.toml": (ROOT / "mise.toml").read_text(),
                "renovate.jsonc": (ROOT / "renovate.jsonc").read_text(),
            },
            "jdx/mise-linux-x64": {"install.sh": installer},
            "jdx/mise-macos-arm64": {"install.sh": installer},
            "jdx/mise-macos-x64": {"install.sh": installer},
        }
        for manager in managers:
            for filename, content in sources[manager["depNameTemplate"]].items():
                with self.subTest(dep=manager["depNameTemplate"], file=filename):
                    patterns = [
                        pattern.replace("(?<currentValue>", "(?P<currentValue>")
                        .replace("(?<currentDigest>", "(?P<currentDigest>")
                        for pattern in manager["matchStrings"]
                    ]
                    matches = [
                        match
                        for pattern in patterns
                        for match in re.finditer(pattern, content)
                    ]
                    self.assertEqual(len(matches), 1, matches)
                    self.assertEqual(matches[0].group("currentValue"), manifest_version)
                    if "currentDigest" in matches[0].groupdict():
                        self.assertRegex(matches[0].group("currentDigest"), r"^[0-9a-f]{64}$")

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

    def test_repository_loads_split_manifest(self) -> None:
        mise = shutil.which("mise")
        self.assertIsNotNone(mise, "mise must be installed to validate config discovery")

        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory).resolve() / "project"
            (fixture_root / "mise").mkdir(parents=True)
            for relative in ("mise.toml", "mise/config.toml"):
                shutil.copyfile(ROOT / relative, fixture_root / relative)
            environment = dict(os.environ)
            environment["MISE_CONFIG_DIR"] = temporary_directory
            environment["MISE_CACHE_DIR"] = str(
                Path(temporary_directory) / "cache"
            )
            environment["MISE_STATE_DIR"] = str(
                Path(temporary_directory) / "state"
            )
            trust = subprocess.run(
                [mise, "trust", str(fixture_root / "mise.toml")],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(trust.returncode, 0, trust.stderr)
            result = subprocess.run(
                [mise, "-C", str(fixture_root), "config", "ls", "--json"],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            user_status = subprocess.run(
                [
                    mise,
                    "-C",
                    str(fixture_root),
                    "bootstrap",
                    "user",
                    "status",
                    "--json",
                ],
                cwd=fixture_root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        loaded_paths = {Path(item["path"]) for item in json.loads(result.stdout)}
        self.assertEqual(
            loaded_paths,
            {fixture_root / "mise.toml", fixture_root / "mise/config.toml"},
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

    def test_mole_archive_fields_have_valid_structure(self) -> None:
        manifest = (ROOT / "mise.toml").read_text()
        start = manifest.index('[tools."http:mole"]')
        end = manifest.index("\n[", start + 1)
        section = manifest[start:end]
        cases = [(None, None, True)]
        for field, invalid_values in {
            "url": ('"http://example.com/mole.tar.gz"', '"https://"', "42"),
            "checksum": ('"sha256:abc"', '"md5:' + "a" * 32 + '"', "42"),
            "strip_components": ('"1"', "true", "1.5"),
            "bin_path": ('""', '" "', "42"),
            "postinstall": ('""', '" "', "42"),
        }.items():
            for value in (None, *invalid_values):
                cases.append((field, value, False))
        cases.extend((field, value, True) for field, value in (
            ("url", '"https://example.com/mole-{{ version }}.tar.gz"'),
            ("checksum", '"sha256:' + "a" * 64 + '"'),
        ))
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture = Path(temporary_directory)
            for relative in ("mise/config.toml", "mise.work.toml", "mise.work.lock", "mise.lock", "dot_config/mise/config.toml.tmpl",
                             ".chezmoiremove", "scripts/ci/validate-mise.py"):
                destination = fixture / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, destination)
            for field, value, success in cases:
                with self.subTest(field=field, value=value):
                    modified = section if field is None else re.sub(
                        rf"^{field} = .*\n?", "" if value is None else f"{field} = {value}\n",
                        section, flags=re.MULTILINE,
                    )
                    (fixture / "mise.toml").write_text(manifest[:start] + modified + manifest[end:])
                    result = subprocess.run([sys.executable, "-B", str(fixture / "scripts/ci/validate-mise.py")],
                                            capture_output=True, text=True, check=False)
                    self.assertEqual(result.returncode == 0, success, result.stderr)
                    if not success:
                        self.assertIn("Mole", result.stderr)

    def test_requested_version_must_own_each_locked_platform_url(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            for relative in (
                "mise.toml",
                "mise.work.toml",
                "mise.work.lock",
                "mise/config.toml",
                "mise.lock",
                "dot_config/mise/config.toml.tmpl",
                ".chezmoiremove",
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
