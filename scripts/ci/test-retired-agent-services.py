#!/usr/bin/env python3
"""Verify retired services stop before their definitions are removed."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/remove-retired-agent-services.sh"


class RetiredServiceTests(unittest.TestCase):
    def test_retirement_is_idempotent_and_preserves_other_services(self):
        for platform, directory, suffix in (
            ("Darwin", "Library/LaunchAgents", ".plist"),
            ("Linux", ".config/systemd/user", ".service"),
        ):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as temp:
                home = Path(temp)
                binary = home / "bin"
                binary.mkdir()
                units = home / directory
                units.mkdir(parents=True)
                for name in ("codex-usage-exporter", "ollama", "yaskkserv2", "user"):
                    (units / f"dev.mise.{name}{suffix}").write_text(name)
                log = home / "commands"
                for name, content in {
                    "uname": f"echo {platform}",
                    "id": "echo 501",
                    "launchctl": 'echo "launchctl $*" >>"$COMMAND_LOG"; '
                    'if test "$1" = bootout; then exit "${STOP_STATUS:-0}"; fi; exit "${SERVICE_STATUS:-0}"',
                    "systemctl": 'echo "systemctl $*" >>"$COMMAND_LOG"; '
                    'if test "$2" = disable; then exit "${STOP_STATUS:-0}"; fi; exit "${SERVICE_STATUS:-0}"',
                }.items():
                    path = binary / name
                    path.write_text("#!/bin/sh\n" + content + "\n")
                    path.chmod(0o755)
                env = {
                    **os.environ,
                    "HOME": str(home),
                    "PATH": f"{binary}:/usr/bin:/bin",
                    "COMMAND_LOG": str(log),
                }
                for failure in ({"SERVICE_STATUS": "17"}, {"STOP_STATUS": "19"}):
                    failed = subprocess.run(
                        ["bash", str(SCRIPT)], env={**env, **failure},
                        capture_output=True, text=True,
                    )
                    self.assertEqual(failed.returncode, int(next(iter(failure.values()))))
                    self.assertTrue((units / f"dev.mise.codex-usage-exporter{suffix}").exists())
                log.write_text("")
                for _ in range(2):
                    result = subprocess.run(
                        ["bash", str(SCRIPT)], env=env, capture_output=True, text=True
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                for name in ("codex-usage-exporter", "ollama"):
                    self.assertFalse((units / f"dev.mise.{name}{suffix}").exists())
                for name in ("yaskkserv2", "user"):
                    self.assertEqual(
                        (units / f"dev.mise.{name}{suffix}").read_text(), name
                    )
                commands = log.read_text()
                self.assertNotIn("yaskkserv2", commands)
                self.assertNotIn("dev.mise.user", commands)
                if platform == "Darwin":
                    self.assertEqual(commands.count("bootout"), 2)
                else:
                    self.assertEqual(commands.count("disable --now"), 2)
                    self.assertEqual(commands.count("daemon-reload"), 1)


if __name__ == "__main__":
    unittest.main()
