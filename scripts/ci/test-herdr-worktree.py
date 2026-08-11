#!/usr/bin/env python3

"""Regression tests for the Herdr worktree command."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "dot_local/bin/executable_herdr-worktree"


class HerdrWorktreeTests(unittest.TestCase):
    def run_worktree(
        self,
        *,
        branch_argument: str | None,
        stdin_branch: str,
        expected_branch: str,
        herdr_response: str | None = None,
        git_ref_valid: bool = True,
    ) -> tuple[subprocess.CompletedProcess[str], list[str]]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            fake_bin = fixture_root / "bin"
            fake_bin.mkdir()
            log_path = fixture_root / "commands.log"
            worktree_path = fixture_root / "synthetic-worktree"
            base_repo = fixture_root / "synthetic-repository"

            (fake_bin / "zsh").write_text(
                """#!/bin/sh
set -eu
printf 'zsh %s\\n' "$*" >> "$FAKE_LOG"
[ "${1-}" = "-lic" ]
shift
body="${1-}"
shift
if [ "${1-}" = "--" ]; then
  shift
fi
export HERDR_WORKTREE_BODY="$body"
exec /bin/zsh -f -c '
_wt_base() { print -r -- "$FAKE_BASE_REPO"; }
_wt_branch_to_dir() { print -r -- "synthetic-branch"; }
_wt_run_hook() { return 0; }
eval "$HERDR_WORKTREE_BODY"
' -- "$@"
""",
                encoding="utf-8",
            )
            (fake_bin / "wt").write_text(
                """#!/bin/sh
set -eu
printf 'wt %s\\n' "$*" >> "$FAKE_LOG"
case "${1-}" in
  home-path) printf '%s\\n' "$FAKE_BASE_REPO" ;;
esac
""",
                encoding="utf-8",
            )
            (fake_bin / "git").write_text(
                """#!/bin/sh
set -eu
printf 'git %s\\n' "$*" >> "$FAKE_LOG"
case "${1-} ${2-}" in
  "check-ref-format --branch")
    [ "$FAKE_GIT_REF_VALID" = "1" ] || exit 1
    exit 0
    ;;
  "worktree list")
    printf 'worktree %s\\nbranch refs/heads/%s\\n' "$FAKE_WORKTREE_PATH" "$EXPECTED_BRANCH"
    exit 0
    ;;
  "worktree add") exit 0 ;;
  "show-ref --verify") exit 0 ;;
esac
exit 99
""",
                encoding="utf-8",
            )
            (fake_bin / "herdr").write_text(
                """#!/bin/sh
set -eu
printf 'herdr %s\\n' "$*" >> "$FAKE_LOG"
if [ -n "$FAKE_HERDR_RESPONSE" ]; then
  printf '%s\\n' "$FAKE_HERDR_RESPONSE"
fi
""",
                encoding="utf-8",
            )
            for command in fake_bin.iterdir():
                command.chmod(0o755)

            environment = os.environ.copy()
            environment.update(
                {
                    "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
                    "FAKE_LOG": str(log_path),
                    "FAKE_BASE_REPO": str(base_repo),
                    "FAKE_WORKTREE_PATH": str(worktree_path),
                    "EXPECTED_BRANCH": expected_branch,
                    "FAKE_HERDR_RESPONSE": herdr_response or "",
                    "FAKE_GIT_REF_VALID": "1" if git_ref_valid else "0",
                }
            )
            command = ["/bin/bash", str(SCRIPT)]
            if branch_argument is not None:
                command.append(branch_argument)
            result = subprocess.run(
                command,
                input=f"{stdin_branch}\n",
                text=True,
                capture_output=True,
                check=False,
                env=environment,
            )

            herdr_calls = [
                line for line in log_path.read_text(encoding="utf-8").splitlines() if line.startswith("herdr ")
            ]
            return result, herdr_calls

    def test_explicit_branch_does_not_prompt_or_consume_stdin(self) -> None:
        branch = "feat/explicit-branch"
        stdin_branch = "feat/from-stdin"
        result, herdr_calls = self.run_worktree(
            branch_argument=branch,
            stdin_branch=stdin_branch,
            expected_branch=branch,
        )

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertNotIn("Branch name (for example issue/123 or feat/login):", result.stdout)
        self.assertEqual(len(herdr_calls), 1)
        self.assertIn(f"--label {branch}", herdr_calls[0])
        self.assertNotIn(f"--label {stdin_branch}", herdr_calls[0])

    def test_explicit_branch_returns_background_herdr_json(self) -> None:
        branch = "feat/machine-branch"
        expected_response = {
            "result": {
                "workspace": {"workspace_id": "w-fixture"},
                "root_pane": {"pane_id": "w-fixture:p-root"},
            }
        }
        result, herdr_calls = self.run_worktree(
            branch_argument=branch,
            stdin_branch="feat/ignored-stdin",
            expected_branch=branch,
            herdr_response=json.dumps(expected_response),
        )

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        try:
            stdout_response = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            self.fail(f"stdout is not exactly one JSON document ({error}): {result.stdout!r}")
        self.assertEqual(stdout_response, expected_response)
        self.assertEqual(len(herdr_calls), 1)
        self.assertIn(f"--label {branch}", herdr_calls[0])
        self.assertIn("--no-focus", herdr_calls[0])
        self.assertNotIn("--focus", herdr_calls[0])

    def test_invalid_explicit_branch_fails_before_prompt_or_workspace_open(self) -> None:
        branch = "invalid branch"
        result, herdr_calls = self.run_worktree(
            branch_argument=branch,
            stdin_branch="feat/ignored-stdin",
            expected_branch=branch,
            git_ref_valid=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Branch name (for example issue/123 or feat/login):", result.stdout)
        self.assertIn(f"error: invalid branch name: {branch}", result.stderr)
        self.assertEqual(herdr_calls, [])
        self.assertNotIn('"result"', result.stdout)

    def test_no_argument_prompts_and_opens_focused_stdin_branch(self) -> None:
        branch = "feat/from-stdin"
        result, herdr_calls = self.run_worktree(
            branch_argument=None,
            stdin_branch=branch,
            expected_branch=branch,
        )

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Branch name (for example issue/123 or feat/login):", result.stdout)
        self.assertIn(f"✓ opened in Herdr: {branch}", result.stdout)
        self.assertEqual(len(herdr_calls), 1)
        self.assertIn(f"--label {branch}", herdr_calls[0])
        self.assertIn("--focus", herdr_calls[0])


if __name__ == "__main__":
    unittest.main()
