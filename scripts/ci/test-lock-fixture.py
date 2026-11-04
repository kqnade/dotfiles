#!/usr/bin/env python3
"""Verify lock fixtures ignore inherited locked mode."""
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

SUITE = runpy.run_path(str(Path(__file__).parent / "integration/test-mise-lock.py"))

class LockFixtureTests(unittest.TestCase):
    def test_fresh_resolution_disables_inherited_locked_mode(self):
        class CheckedEnvironment(Exception):
            pass

        def run(command, *, cwd, env, **kwargs):
            self.assertEqual(env["MISE_LOCKED"], "0")
            self.assertEqual(env["MISE_STATE_DIR"], str(cwd / "state"))
            raise CheckedEnvironment

        with patch.dict(os.environ, {"MISE_LOCKED": "1"}), patch("shutil.which", return_value="mise"), patch("subprocess.run", side_effect=run):
            with self.assertRaises(CheckedEnvironment):
                SUITE["LockResolutionTests"]().test_1password_lock_resolves_official_archives_without_warnings()

if __name__ == "__main__":
    unittest.main()
