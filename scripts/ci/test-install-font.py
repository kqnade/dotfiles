#!/usr/bin/env python3
"""Failure paths for install-font.sh under /bin/bash.

macOS resolves bash to /bin/bash 3.2, where set -u rejects an empty
"${array[@]}" expansion. Curl and checksum failures happen before any font
is staged, so the EXIT trap must keep their status.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/install-font.sh"
BASH = "/bin/bash"


class InstallFontFailureTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(Path(BASH).is_file())
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / "home"
        self.bin = self.root / "bin"
        self.tmp = self.root / "tmp"
        self.home.mkdir()
        self.bin.mkdir()
        self.tmp.mkdir()
        self.log = self.root / "commands.log"

    def stub(self, name: str, script: str) -> None:
        executable = self.bin / name
        executable.write_text(script)
        executable.chmod(0o755)

    def run_install(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [BASH, str(SCRIPT)],
            cwd=self.root,
            env={
                "HOME": str(self.home),
                "PATH": f"{self.bin}:/usr/bin:/bin",
                "TMPDIR": str(self.tmp),
                "COMMAND_LOG": str(self.log),
            },
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )

    def assert_cleaned(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertNotIn("unbound variable", result.stderr)
        self.assertNotIn("Installed", result.stdout)
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.assertFalse((self.home / ".local/share/fonts").exists())
        self.assertFalse((self.home / "Library/Fonts").exists())
        self.assertIn("curl ", self.log.read_text())

    def test_cleanup_uses_bash32_empty_array_expansion(self):
        source = SCRIPT.read_text()
        start = source.index("cleanup()")
        cleanup = source[start:source.index("trap cleanup EXIT", start)]
        self.assertIn('${staged_fonts[@]+"${staged_fonts[@]}"}', cleanup)

    def test_download_and_checksum_failures_keep_status(self):
        failures = {
            "download": (
                """#!/bin/sh
printf 'curl %s\\n' "$*" >>"$COMMAND_LOG"
exit 22
""",
                22,
            ),
            "checksum": (
                """#!/bin/sh
printf 'curl %s\\n' "$*" >>"$COMMAND_LOG"
while test "$#" -gt 0; do
  if test "$1" = -o; then
    printf 'not-a-font-archive\\n' >"$2"
    exit 0
  fi
  shift
done
exit 98
""",
                1,
            ),
        }
        for name, (script, status) in failures.items():
            with self.subTest(failure=name):
                self.log.unlink(missing_ok=True)
                shutil.rmtree(self.tmp)
                self.tmp.mkdir()
                self.stub("curl", script)
                result = self.run_install()
                self.assertEqual(result.returncode, status, result.stderr)
                self.assert_cleaned(result)


if __name__ == "__main__":
    unittest.main()
