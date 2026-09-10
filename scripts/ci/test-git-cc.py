import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[2] / "dot_config/zsh/functions/cc.zsh"


class GitCommitMessageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, HOME=str(self.root), GIT_CONFIG_NOSYSTEM="1")
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("commit", "--allow-empty", "-qm", "initial style reference")
        (self.root / "example.txt").write_text("staged content\n")
        self.git("add", "example.txt")
        launcher = self.root / ".local/bin/pi-telemetry"
        launcher.parent.mkdir(parents=True)
        launcher.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, pathlib, sys\n"
            "root = pathlib.Path.home()\n"
            "(root / 'args.json').write_text(json.dumps(sys.argv[1:]))\n"
            "(root / 'prompt.txt').write_text(sys.stdin.read())\n"
            "print(os.environ.get('TEST_MESSAGE', '✨ feat: add example'))\n"
            "sys.exit(int(os.environ.get('TEST_EXIT', '0')))\n"
        )
        launcher.chmod(0o755)
        blocker = launcher.parent / "codex"
        blocker.write_text("#!/bin/sh\nexit 99\n")
        blocker.chmod(0o755)
        self.env["PATH"] = str(launcher.parent) + os.pathsep + self.env["PATH"]

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.root, env=self.env,
            text=True, capture_output=True, check=True,
        ).stdout.strip()

    def run_cc(self):
        return subprocess.run(
            ["zsh", "-f", "-c", 'source "$1"; git-cc', "zsh", str(SOURCE)],
            cwd=self.root, env=self.env, text=True, capture_output=True,
        )

    def test_commits_pi_message_from_staged_diff(self):
        result = self.run_cc()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git("log", "-1", "--format=%s"), "✨ feat: add example")
        prompt = (self.root / "prompt.txt").read_text()
        self.assertIn("+staged content", prompt)
        self.assertIn("initial style reference", prompt)
        args = json.loads((self.root / "args.json").read_text())
        self.assertIn("--no-tools", args)
        self.assertIn("--print", args)
        self.assertIn("--no-session", args)
        self.assertEqual(args[args.index("--provider") + 1], "openai-codex")
        self.assertEqual(args[args.index("--model") + 1], "gpt-5.6-luna")

    def test_generation_failure_keeps_changes_staged(self):
        self.env["TEST_EXIT"] = "1"
        result = self.run_cc()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git("log", "-1", "--format=%s"), "initial style reference")
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "example.txt")

    def test_empty_message_does_not_commit(self):
        self.env["TEST_MESSAGE"] = ""
        self.assertNotEqual(self.run_cc().returncode, 0)
        self.assertEqual(self.git("log", "-1", "--format=%s"), "initial style reference")

    def test_no_staged_changes_does_not_invoke_pi(self):
        self.git("reset", "-q", "HEAD", "--", "example.txt")
        self.assertNotEqual(self.run_cc().returncode, 0)
        self.assertFalse((self.root / "args.json").exists())


if __name__ == "__main__":
    unittest.main()
