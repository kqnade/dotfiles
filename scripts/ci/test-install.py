#!/usr/bin/env python3
"""Offline behavior tests for the standalone mise installer."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[2]
VERSION = tomllib.loads((ROOT / "mise.toml").read_text())["min_version"]


class InstallTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / "home"
        self.bin = self.root / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.mise = self.home / ".local/bin/mise"
        self.mise.parent.mkdir(parents=True)
        self.checkout = self.root / "checkout"
        (self.checkout / ".git").mkdir(parents=True)
        (self.checkout / "mise.toml").write_text("")
        self.log = self.root / "commands.log"
        self.payload = self.root / "payload"
        self.payload.write_text(self.mise_script(VERSION))
        checksum = hashlib.sha256(self.payload.read_bytes()).hexdigest()
        self.installer = self.root / "install.sh"
        self.installer.write_text(
            re.sub(
                r'(readonly MISE_\w+_SHA256=")[0-9a-f]{64}("\n)',
                rf"\g<1>{checksum}\2",
                (ROOT / "install.sh").read_text(),
            )
        )
        self.stub(
            "uname",
            '#!/bin/sh\ncase "$1" in\n-s) echo "$TEST_OS";;\n-m) echo "$TEST_ARCH";;\nesac\n',
        )
        self.stub(
            "xcode-select", '#!/bin/sh\nprintf "xcode-select\\n" >>"$COMMAND_LOG"\n'
        )
        self.stub("git", '#!/bin/sh\nprintf "git\\n" >>"$COMMAND_LOG"\nexit 97\n')
        self.stub(
            "curl",
            """#!/bin/sh
printf 'curl %s\n' "$*" >>"$COMMAND_LOG"
while test "$#" -gt 0; do
  if test "$1" = -o; then
    cp "$PAYLOAD" "$2"
    exit "${CURL_STATUS:-0}"
  fi
  shift
done
exit 98
""",
        )
        self.env = {
            "HOME": str(self.home),
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "TMPDIR": str(self.root),
            "COMMAND_LOG": str(self.log),
            "PAYLOAD": str(self.payload),
            "DOTFILES_MISE_BIN": str(self.mise),
            "DOTFILES_REPO_DIR": str(self.checkout),
            "TEST_OS": "Darwin",
            "TEST_ARCH": "arm64",
        }

    def stub(self, name: str, script: str):
        executable = self.bin / name
        executable.write_text(script)
        executable.chmod(0o755)

    def mise_script(self, version: str) -> str:
        return (
            '#!/bin/sh\nprintf \'mise %s\\n\' "$*" >>"$COMMAND_LOG"\n'
            f'if test "$1" = --version; then echo "{version}"; fi\n'
        )

    def run_install(self, *args: str):
        return subprocess.run(
            ["bash", str(self.installer), *args],
            cwd=self.root,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )

    def commands(self) -> list[str]:
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_mise_only_installs_verified_asset_without_bootstrap(self):
        for system, arch, asset in (
            ("Darwin", "arm64", "macos-arm64"),
            ("Darwin", "x86_64", "macos-x64"),
            ("Linux", "x86_64", "linux-x64"),
        ):
            with self.subTest(system=system, arch=arch):
                self.env.update(TEST_OS=system, TEST_ARCH=arch)
                self.mise.unlink(missing_ok=True)
                self.log.unlink(missing_ok=True)
                result = self.run_install("--mise-only")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.mise.read_bytes(), self.payload.read_bytes())
                self.assertTrue(os.access(self.mise, os.X_OK))
                self.assertEqual(list(self.mise.parent.iterdir()), [self.mise])
                commands = self.commands()
                self.assertEqual(len(commands), 1, commands)
                self.assertIn(
                    f"https://github.com/jdx/mise/releases/download/v{VERSION}/mise-v{VERSION}-{asset}",
                    commands[0],
                )
                self.assertTrue(commands[0].startswith("curl "), commands)

    def test_reuses_a_sufficient_installed_version_without_downloading(self):
        original = self.mise_script(VERSION)
        self.mise.write_text(original)
        self.mise.chmod(0o755)
        result = self.run_install("--mise-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.mise.read_text(), original)
        self.assertEqual(self.commands(), ["mise --version"])

    def test_failed_download_or_checksum_preserves_installed_mise(self):
        original = self.mise_script("2020.1.1")
        for failure in ("download", "checksum"):
            with self.subTest(failure=failure):
                self.mise.write_text(original)
                self.mise.chmod(0o755)
                self.log.unlink(missing_ok=True)
                self.env["CURL_STATUS"] = "22" if failure == "download" else "0"
                if failure == "checksum":
                    self.payload.write_text("#!/bin/sh\nexit 99\n")
                result = self.run_install("--mise-only")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    "Failed to download"
                    if failure == "download"
                    else "checksum verification failed",
                    result.stderr,
                )
                self.assertEqual(self.mise.read_text(), original)
                self.assertEqual(list(self.mise.parent.iterdir()), [self.mise])
                self.assertEqual(len(self.commands()), 2, self.commands())

    def test_rejects_unknown_or_extra_arguments_before_installing(self):
        for args in (("--unknown",), ("--mise-only", "extra")):
            with self.subTest(args=args):
                result = self.run_install(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Usage:", result.stderr)
                self.assertFalse(self.mise.exists())
                self.assertEqual(self.commands(), [])

    def test_default_mode_trusts_and_bootstraps_checkout(self):
        self.mise.write_text(self.mise_script(VERSION))
        self.mise.chmod(0o755)
        result = self.run_install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.commands(),
            [
                "xcode-select",
                "mise --version",
                f"mise trust {self.checkout}/mise.toml",
                f"mise -C {self.checkout} bootstrap --yes",
            ],
        )


if __name__ == "__main__":
    unittest.main()
