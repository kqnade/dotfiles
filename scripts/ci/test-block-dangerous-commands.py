#!/usr/bin/env python3
"""Hook decisions for rm flag order and protected git push shapes.

Issue #240. Commands that contain --force-with-lease keep their previous
decision; this file does not choose a new policy for that case.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "dot_claude/hooks/executable_block-dangerous-commands.sh"


class BlockDangerousCommandsTests(unittest.TestCase):
    def decision(self, command: str) -> str | None:
        env = dict(os.environ)
        env["CLAUDE_PROTECTED_BRANCHES"] = "main,master,trunk"
        result = subprocess.run(
            ["bash", str(HOOK)],
            input=json.dumps({"tool_input": {"command": command}}),
            text=True,
            capture_output=True,
            check=False,
            env=env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        if not result.stdout.strip():
            return None
        payload = json.loads(result.stdout)
        return payload["hookSpecificOutput"]["permissionDecision"]

    def assert_denied(self, command: str) -> None:
        self.assertEqual(self.decision(command), "deny", command)

    def assert_allowed(self, command: str) -> None:
        self.assertIsNone(self.decision(command), command)

    def test_rm_flag_order_and_long_options_on_dangerous_paths(self) -> None:
        for command in (
            "rm -rf ~",
            "rm -rf /",
            "rm -rf /*",
            "rm -rf $HOME",
            "rm -rf ../..",
            "rm -fr ~",
            "rm -fr '~'",
            "/bin/rm -fr ~",
            "rm -r -f /",
            "rm -f -r /",
            "rm --recursive --force ~",
            "rm --force --recursive ~",
            "rm -r --force ~",
            "rm --recursive -f /",
        ):
            with self.subTest(command=command):
                self.assert_denied(command)

    def test_rm_without_both_flags_or_on_a_safe_path_is_allowed(self) -> None:
        for command in (
            "rm -r ~",
            "rm -f /",
            "rm --recursive ~",
            "rm --force /",
            "rm -rf /tmp/foo",
            "rm -fr /tmp/foo",
            "rm --recursive --force /tmp/foo",
        ):
            with self.subTest(command=command):
                self.assert_allowed(command)

    def test_rm_system_directories_accept_the_same_flag_shapes(self) -> None:
        for command in (
            "rm -rf /usr",
            "rm -fr /etc",
            "rm -r -f /var/log",
            "rm --recursive --force /bin",
        ):
            with self.subTest(command=command):
                self.assert_denied(command)
        self.assert_allowed("rm -fr /tmp")

    def test_protected_push_shapes_from_issue_240(self) -> None:
        for command in (
            "git push origin main",
            "git push origin HEAD:main",
            "git push -u origin main",
            "git push --set-upstream origin trunk",
            "git push origin +main",
            "git -C /repo push origin main",
            "git -C/repo push origin trunk",
            "git -c user.name=test push origin main",
            "git -C /repo -c user.name=test push -u origin +main",
            "git push -u origin +trunk",
        ):
            with self.subTest(command=command):
                self.assert_denied(command)

    def test_unprotected_pushes_stay_allowed(self) -> None:
        for command in (
            "git push origin feature",
            "git push origin mainstream",
            "git push origin main-backup",
            "git push -u origin feature",
            "git push --set-upstream origin feature",
            "git push origin +feature",
            "git -C /repo push origin feature",
            "git -c user.name=test push -u origin feature",
        ):
            with self.subTest(command=command):
                self.assert_allowed(command)

    def test_force_with_lease_on_a_protected_branch_is_unchanged(self) -> None:
        # Historical allow. Issue #240 still needs a decision for this shape.
        for command in (
            "git push --force-with-lease origin main",
            "git push --force-with-lease origin trunk",
            "git push -u --force-with-lease origin main",
            "git push --force-with-lease origin +main",
            "git -C /repo push --force-with-lease origin main",
            "git -c user.name=test push --set-upstream --force-with-lease origin trunk",
        ):
            with self.subTest(command=command):
                self.assert_allowed(command)
        self.assert_denied("git push --force-with-lease origin HEAD:main")

    def test_force_push_without_lease_stays_denied(self) -> None:
        self.assert_denied("git push --force origin feature")
        self.assert_denied("git push -f origin feature")
        self.assert_allowed("git push --force-with-lease origin feature")


if __name__ == "__main__":
    unittest.main()
