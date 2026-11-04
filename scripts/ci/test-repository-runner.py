#!/usr/bin/env python3
"""Exercise suite discovery and failure propagation without external services."""

from pathlib import Path
import runpy
import tempfile
import unittest

RUNNER = runpy.run_path(str(Path(__file__).with_name("validate-repository.py")))


class RunnerTests(unittest.TestCase):
    def test_discovers_top_level_tests_and_validators_without_helpers(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ("test-one.py", "validate-source.py", "test-node.mjs",
                         "helper.py", "validate-repository.py"):
                (root / name).touch()
            (root / "integration").mkdir()
            (root / "integration/test-network.py").touch()
            self.assertIn("suite_commands", RUNNER)
            commands = RUNNER["suite_commands"](root)
            paths = [Path(arg).name for command in commands for arg in command
                     if arg.startswith(str(root))]
            self.assertCountEqual(paths, ["test-one.py", "validate-source.py", "test-node.mjs"])

    def test_executes_python_and_node_tests(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "test-one.py").write_text("assert 2 + 2 == 4\n")
            (root / "test-node.mjs").write_text("import assert from 'node:assert/strict'; assert.equal(2 + 2, 4);\n")
            self.assertIn("run_suite", RUNNER)
            self.assertEqual(RUNNER["run_suite"](root), 0)

    def test_failure_stops_the_suite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / "unexpected"
            (root / "test-a.py").write_text("raise SystemExit(7)\n")
            (root / "test-b.py").write_text(f"from pathlib import Path; Path({str(marker)!r}).touch()\n")
            self.assertIn("run_suite", RUNNER)
            self.assertEqual(RUNNER["run_suite"](root), 7)
            self.assertFalse(marker.exists())


if __name__ == "__main__":
    unittest.main()
