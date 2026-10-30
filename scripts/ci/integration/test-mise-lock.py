#!/usr/bin/env python3
"""Resolve pinned archives against their upstream registries."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[3]


class LockResolutionTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
