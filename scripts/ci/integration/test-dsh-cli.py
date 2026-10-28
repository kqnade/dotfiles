#!/usr/bin/env python3
"""Exercise the installed CLI with isolated launcher fixtures."""
import os
from pathlib import Path
import runpy
import subprocess
import sys
import unittest

assert os.environ.get("DSH_TEST_CLI"), "DSH_TEST_CLI must point to the installed work CLI"
fixtures = runpy.run_path(str(Path(__file__).resolve().parents[1] / "test-dsh-profiles.py"))


class InstalledCliTests(fixtures["DshProfilesTests"]):
    def test_real_cli_consumes_guard_overlay_before_web_arguments(self):
        result = self.launch("work", "web", "--no-open", cwd=self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        (call,) = self.calls()
        # Dump mode reports forwarded app arguments without loading a profile or starting Web.
        parsed = subprocess.run(
            [os.environ["DSH_TEST_CLI"], "--dump-config", *call["args"]],
            cwd=self.root, env=dict(call["env"], PATH=os.environ["PATH"]),
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(parsed.returncode, 1, parsed.stderr)
        self.assertIn("config dumps take no app arguments", parsed.stderr)
        self.assertIn('"--host"', parsed.stderr)
        self.assertNotIn('"--patch"', parsed.stderr)
        self.assertNotIn("web-required.patch.yml", parsed.stderr)


if __name__ == "__main__":
    suite = unittest.TestSuite([InstalledCliTests("test_real_cli_consumes_guard_overlay_before_web_arguments")])
    raise SystemExit(not unittest.TextTestRunner().run(suite).wasSuccessful())
