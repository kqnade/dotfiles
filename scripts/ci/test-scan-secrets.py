#!/usr/bin/env python3
"""Behavior tests for the Claude secret-scanning PreToolUse hook."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "dot_claude/hooks/executable_scan-secrets.sh"


class ScanSecretsTests(unittest.TestCase):
    def run_hook(self, payload: dict, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/bash", str(HOOK)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )

    def decision(self, result: subprocess.CompletedProcess[str]) -> dict:
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)["hookSpecificOutput"]

    def test_missing_jq_denies_the_write(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env = os.environ.copy()
            env["PATH"] = directory
            result = self.run_hook(
                {"tool_name": "Write", "tool_input": {"content": "plain text"}},
                env=env,
            )
        output = self.decision(result)
        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn("jq", output["permissionDecisionReason"])

    def test_allows_text_that_only_resembles_secrets(self) -> None:
        content = "\n".join([
            "AIza short",
            "npm_short",
            "glpat-short",
            "-----BEGIN PUBLIC KEY-----",
        ])
        result = self.run_hook({"tool_name": "Write", "tool_input": {"content": content}})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_detects_google_api_key(self) -> None:
        self.assert_asks("AIza" + "A" * 35, "Google API key")

    def test_detects_npm_token(self) -> None:
        self.assert_asks("npm_" + "a" * 36, "npm token")

    def test_detects_gitlab_token(self) -> None:
        self.assert_asks("glpat-" + "a" * 20, "GitLab token")

    def test_detects_encrypted_private_key(self) -> None:
        self.assert_asks("-----BEGIN ENCRYPTED PRIVATE KEY-----", "private key block")

    def test_detects_plain_private_key(self) -> None:
        self.assert_asks("-----BEGIN PRIVATE KEY-----", "private key block")

    def assert_asks(self, content: str, label: str) -> None:
        result = self.run_hook({
            "tool_name": "Write",
            "tool_input": {"file_path": "secret.txt", "content": content},
        })
        output = self.decision(result)
        self.assertEqual(output["permissionDecision"], "ask")
        self.assertEqual(output["hookEventName"], "PreToolUse")
        self.assertIn(label, output["permissionDecisionReason"])


if __name__ == "__main__":
    unittest.main()
