#!/usr/bin/env python3
"""Check the macOS Tailscale app CLI launcher."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "dot_local/bin/executable_tailscale"
APP_BINARY = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"


class TailscaleCliTests(unittest.TestCase):
    def run_launcher(self, missing=False):
        self.assertTrue(LAUNCHER.is_file(), "Tailscale launcher is missing")
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            app = directory / "Tailscale.app/Contents/MacOS/Tailscale"
            if not missing:
                app.parent.mkdir(parents=True)
                app.write_text(
                    "#!/bin/sh\n"
                    "printf '%s\\n' \"$TAILSCALE_BE_CLI\" \"$@\"\n"
                    "exit 23\n"
                )
                app.chmod(0o755)
            launcher = directory / "tailscale"
            launcher.write_text(LAUNCHER.read_text().replace(APP_BINARY, str(app)))
            launcher.chmod(0o755)
            return subprocess.run(
                [str(launcher), "status", "--json", "argument with spaces", ""],
                env={**os.environ, "TAILSCALE_BE_CLI": "0"},
                capture_output=True,
                text=True,
                check=False,
            )

    def test_forces_cli_mode_and_preserves_arguments_and_exit_status(self):
        result = self.run_launcher()
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertEqual(
            result.stdout.splitlines(),
            ["1", "status", "--json", "argument with spaces", ""],
        )

    def test_missing_app_fails(self):
        result = self.run_launcher(missing=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(result.stderr)

    def test_launcher_is_ignored_outside_macos(self):
        for platform in ("darwin", "linux", "windows"):
            with self.subTest(platform=platform):
                rendered = subprocess.check_output(
                    [
                        "chezmoi", "--source", str(ROOT),
                        "--override-data", json.dumps({"chezmoi": {"os": platform, "kernel": {"osrelease": "test"}}}),
                        "execute-template", "--file", str(ROOT / ".chezmoiignore"),
                    ],
                    text=True,
                )
                self.assertEqual(
                    ".local/bin/tailscale" in rendered.splitlines(),
                    platform != "darwin",
                )


if __name__ == "__main__":
    unittest.main()
