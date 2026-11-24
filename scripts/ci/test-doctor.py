#!/usr/bin/env python3
"""Behavior tests for doctor checks."""

from __future__ import annotations

from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class DoctorFontTests(unittest.TestCase):
    def run_font_ok(self, prelude: str) -> subprocess.CompletedProcess[str]:
        script = "\n".join(
            (
                "set -uo pipefail",
                prelude,
                "source scripts/doctor.sh",
                "font_ok",
            )
        )
        return subprocess.run(
            ["bash", "--noprofile", "--norc", "-c", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    def test_linux_font_check_accepts_early_match_in_large_listing(self):
        result = self.run_font_ok(
            "\n".join(
                (
                    "uname() { printf 'Linux\\n'; }",
                    "fc-list() { printf 'udevgothic\\n'; seq 1 200000; }",
                )
            )
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_linux_font_check_accepts_late_mixed_case_match(self):
        result = self.run_font_ok(
            "\n".join(
                (
                    "uname() { printf 'Linux\\n'; }",
                    "fc-list() { seq 1 200000; printf 'UDEVGothic NF\\n'; }",
                )
            )
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_linux_font_check_rejects_large_listing_without_font(self):
        result = self.run_font_ok(
            "\n".join(
                (
                    "uname() { printf 'Linux\\n'; }",
                    "fc-list() { seq 1 200000; }",
                )
            )
        )
        self.assertEqual(result.returncode, 1, result.stderr)

    def test_darwin_font_check_requires_installed_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            fonts = home / "Library" / "Fonts"
            fonts.mkdir(parents=True)
            quoted_home = shlex.quote(str(home))
            missing = self.run_font_ok(
                "\n".join(
                    (
                        f"export HOME={quoted_home}",
                        "uname() { printf 'Darwin\\n'; }",
                    )
                )
            )
            self.assertEqual(missing.returncode, 1, missing.stderr)
            (fonts / "UDEVGothic35NF-Regular.ttf").write_text("font", encoding="utf-8")
            present = self.run_font_ok(
                "\n".join(
                    (
                        f"export HOME={quoted_home}",
                        "uname() { printf 'Darwin\\n'; }",
                    )
                )
            )
            self.assertEqual(present.returncode, 0, present.stderr)


if __name__ == "__main__":
    unittest.main()
