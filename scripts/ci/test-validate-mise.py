#!/usr/bin/env python3

"""Regression tests for the mise manifest and lockfile validator."""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ValidateMiseTests(unittest.TestCase):
    def test_requested_version_must_own_each_locked_platform_url(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            for relative in (
                "mise.toml",
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
