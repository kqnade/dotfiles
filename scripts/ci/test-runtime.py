#!/usr/bin/env python3
"""Behavior tests for the shared bootstrap runtime."""

from __future__ import annotations

from pathlib import Path
import socket
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]


class RuntimePortTests(unittest.TestCase):
    def run_probe(self, function: str, port: int) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "bash",
                "-c",
                "set -euo pipefail; source scripts/lib/runtime.sh; "
                'if "$1" 127.0.0.1 "$2" 1; then exit 0; else exit 1; fi',
                "runtime-test",
                function,
                str(port),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_accepts_a_listening_port(self):
        with socket.socket() as server:
            server.bind(("127.0.0.1", 0))
            server.listen()
            for function in ("dotfiles_port_open", "dotfiles_wait_for_port"):
                with self.subTest(function=function):
                    result = self.run_probe(function, server.getsockname()[1])
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_a_port_without_a_listener(self):
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            port = reserved.getsockname()[1]
        for function in ("dotfiles_port_open", "dotfiles_wait_for_port"):
            with self.subTest(function=function):
                result = self.run_probe(function, port)
                self.assertEqual(result.returncode, 1, result.stderr)


if __name__ == "__main__":
    unittest.main()
