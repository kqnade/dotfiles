#!/usr/bin/env python3
"""Check managed Ollama service definitions and the foreground service process."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ollama-serve.sh"


class OllamaServiceTests(unittest.TestCase):
    def test_service_definitions_keep_the_local_server_running(self):
        bootstrap = tomllib.loads((ROOT / "mise/config.toml").read_text())["bootstrap"]
        mac = bootstrap["macos"]["launchd"]["agents"]["ollama"]
        linux = bootstrap["linux"]["systemd"]["units"]["ollama"]
        command = "~/repos/github.com/kqnade/dotfiles/scripts/ollama-serve.sh"
        self.assertEqual(mac["program"], command)
        self.assertTrue(mac["run_at_load"])
        self.assertTrue(mac["keep_alive"])
        self.assertTrue(mac["kickstart"])
        self.assertEqual(linux["exec_start"], command)
        self.assertEqual(linux["restart"], "on-failure")

    def run_service(self, fail=False):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            binary = directory / "ollama"
            capture = directory / "capture.json"
            binary.write_text(
                "#!/bin/sh\n"
                'printf \'{"host":"%s","arg":"%s"}\\n\' "$OLLAMA_HOST" "$1" > "$CAPTURE"\n'
            )
            binary.chmod(0o755)
            mise = directory / "mise"
            mise.write_text(
                "#!/bin/sh\n"
                'test "$1" = -C && test "$2" = "$DOTFILES_ROOT" && test "$3 $4" = "which ollama" || exit 21\n'
                + ("exit 9\n" if fail else f"printf '%s\\n' '{binary}'\n")
            )
            mise.chmod(0o755)
            result = subprocess.run(
                ["bash", str(SCRIPT)],
                cwd=directory,
                env=dict(
                    os.environ,
                    PATH=f"{directory}:/usr/bin:/bin",
                    DOTFILES_ROOT=str(ROOT),
                    OLLAMA_HOST="0.0.0.0:11434",
                    CAPTURE=str(capture),
                ),
                capture_output=True,
                text=True,
                check=False,
            )
            return result, json.loads(capture.read_text()) if capture.exists() else None

    def test_service_uses_the_pinned_binary_on_loopback(self):
        result, captured = self.run_service()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(captured, {"host": "127.0.0.1:11434", "arg": "serve"})

    def test_missing_tool_fails_instead_of_using_another_binary(self):
        result, captured = self.run_service(fail=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(captured)


if __name__ == "__main__":
    unittest.main()
