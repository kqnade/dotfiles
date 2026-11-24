#!/usr/bin/env python3
"""Behavior tests for the yaskkserv2 service wrapper."""

from __future__ import annotations

from pathlib import Path
import os
import subprocess
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[2]
SERVE = ROOT / "scripts/yaskkserv2-serve.sh"


class Yaskkserv2ServeTests(unittest.TestCase):
    def run_serve(
        self,
        home: Path,
        mise: str,
        *,
        attempts: str = "2",
        interval: str = "0",
        extra_env: dict[str, str] | None = None,
        timeout: float = 5,
    ) -> subprocess.CompletedProcess[str]:
        bin_dir = home / "bin"
        bin_dir.mkdir()
        mise_path = bin_dir / "mise"
        mise_path.write_text(mise)
        mise_path.chmod(0o755)
        environment = os.environ.copy()
        environment.update(
            {
                "HOME": str(home),
                "PATH": f"{bin_dir}:{environment['PATH']}",
                "YASKKSERV2_WAIT_ATTEMPTS": attempts,
                "YASKKSERV2_WAIT_INTERVAL_SECONDS": interval,
            }
        )
        environment.pop("XDG_CACHE_HOME", None)
        if extra_env:
            environment.update(extra_env)
        return subprocess.run(
            ["bash", str(SERVE)],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

    def test_logs_each_missing_prerequisite_and_exits(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = self.run_serve(
                Path(temporary),
                "#!/bin/sh\nprintf '%s\\n' 'mise: trust required' >&2\nexit 1\n",
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stderr.count("mise failed: mise: trust required"), 2)
        self.assertEqual(result.stderr.count("dictionary is missing or empty"), 2)
        self.assertIn("not ready within 2 attempts", result.stderr)
        self.assertNotIn("binary is not available", result.stderr)

    def test_reports_a_missing_binary_when_mise_succeeds_without_one(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = self.run_serve(Path(temporary), "#!/bin/sh\nexit 0\n", attempts="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("binary is not available", result.stderr)
        self.assertNotIn("mise failed", result.stderr)
        self.assertIn("not ready within 1 attempts", result.stderr)

    def test_final_attempt_does_not_keep_sleeping(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            started = time.monotonic()
            result = self.run_serve(
                Path(temporary),
                "#!/bin/sh\nexit 1\n",
                attempts="1",
                interval="30",
            )
            elapsed = time.monotonic() - started

        self.assertNotEqual(result.returncode, 0)
        self.assertLess(elapsed, 5)
        self.assertIn("mise failed", result.stderr)

    def test_starts_when_the_binary_and_dictionary_are_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            server = home / "yaskkserv2"
            log = home / "server.log"
            server.write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" > \"$YASKKSERV2_SERVER_LOG\"\nexit 0\n"
            )
            server.chmod(0o755)
            dictionary = home / ".skk" / "dictionary.yaskkserv2"
            dictionary.parent.mkdir()
            dictionary.write_text("dictionary\n")
            result = self.run_serve(
                home,
                "#!/bin/sh\n"
                "if [ \"$1\" = -C ]; then shift 2; fi\n"
                "if [ \"$1\" = which ] && [ \"$2\" = yaskkserv2 ]; then\n"
                "  printf '%s\\n' \"$YASKKSERV2_FAKE_BIN\"\n"
                "  exit 0\n"
                "fi\n"
                "printf '%s\\n' \"unexpected mise: $*\" >&2\n"
                "exit 1\n",
                extra_env={
                    "YASKKSERV2_FAKE_BIN": str(server),
                    "YASKKSERV2_SERVER_LOG": str(log),
                },
            )
            command = log.read_text()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("waiting", result.stderr)
        self.assertIn("--no-daemonize", command)
        self.assertIn("--listen-address=127.0.0.1", command)
        self.assertIn("--port=1178", command)
        self.assertIn(str(dictionary), command)

    def test_rejects_a_non_positive_attempt_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = self.run_serve(
                Path(temporary),
                "#!/bin/sh\nexit 1\n",
                attempts="0",
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("YASKKSERV2_WAIT_ATTEMPTS", result.stderr)


if __name__ == "__main__":
    unittest.main()
