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


class DoctorWslInteropTests(unittest.TestCase):
    def run_interop(self, ssh_body: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bindir = root / "bin"
            bindir.mkdir()
            ssh = bindir / "ssh.exe"
            ssh.write_text(ssh_body, encoding="utf-8")
            ssh.chmod(0o755)
            log = root / "commands.log"
            script = "\n".join(
                (
                    "set -uo pipefail",
                    f"export PATH={shlex.quote(str(bindir))}:/usr/bin:/bin",
                    f"export COMMAND_LOG={shlex.quote(str(log))}",
                    "source scripts/doctor.sh",
                    "failures=0",
                    'run_check "WSL interop" wsl_interop_ok',
                    'printf "failures=%s\\n" "$failures"',
                    'exit "$failures"',
                )
            )
            result = subprocess.run(
                ["bash", "--noprofile", "--norc", "-c", script],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            result.command_log = log.read_text(encoding="utf-8") if log.exists() else ""
            return result

    def test_launch_succeeds_when_ssh_exe_exits_zero(self):
        result = self.run_interop(
            "#!/bin/sh\nprintf '%s\\n' \"$*\" >>\"$COMMAND_LOG\"\nexit 0\n"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("[ok]", result.stdout)
        self.assertIn("WSL interop", result.stdout)
        self.assertIn("failures=0", result.stdout)
        self.assertIn("-V", result.command_log)

    def test_launch_fails_when_ssh_exe_cannot_execute(self):
        result = self.run_interop("#!/bin/sh\nexit 126\n")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("[failed]", result.stdout)
        self.assertIn("WSL interop", result.stdout)
        self.assertIn("failures=1", result.stdout)

    def test_launch_fails_when_ssh_exe_exceeds_timeout(self):
        result = self.run_interop("#!/bin/sh\nsleep 30\n")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("[failed]", result.stdout)
        self.assertIn("failures=1", result.stdout)

    def test_interop_check_is_limited_to_wsl(self):
        doctor = (ROOT / "scripts/doctor.sh").read_text(encoding="utf-8")
        self.assertIn(
            "\n".join(
                (
                    "  if dotfiles_is_wsl; then",
                    '    run_check "WSL proxies" wsl_proxies_ok',
                    '    run_check "WSL interop" wsl_interop_ok',
                    "  fi",
                )
            ),
            doctor,
        )


if __name__ == "__main__":
    unittest.main()
