#!/usr/bin/env python3
"""Tests for change-aware CI selection and its required status check."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "scripts/ci/ci-policy.py"
BOOTSTRAP_JOBS = (
    "package-bootstrap",
    "linux-bootstrap",
    "macos-bootstrap",
    "intel-fallback",
)


def workflow():
    result = subprocess.run(
        ["yq", "-o=json", ".", str(ROOT / ".github/workflows/ci.yml")],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


class WorkflowTests(unittest.TestCase):
    def test_changes_are_detected_without_workflow_level_path_filters(self):
        config = workflow()
        self.assertEqual(config["on"]["push"], {"branches": ["trunk"]})
        self.assertEqual(
            set(config["on"]), {"push", "pull_request", "workflow_dispatch"}
        )
        self.assertNotIn("pull_request_target", config["on"])
        self.assertIsNone(config["on"]["pull_request"])
        self.assertEqual(config["permissions"], {"contents": "read"})
        changes = config["jobs"]["changes"]
        checkout, detect = changes["steps"]
        self.assertEqual(checkout["with"]["fetch-depth"], 0)
        self.assertIs(checkout["with"]["persist-credentials"], False)
        self.assertEqual(detect["shell"], "bash")
        self.assertIn("git merge-base", detect["run"])
        self.assertIn("--no-renames --name-only -z", detect["run"])
        self.assertIn("--full", detect["run"])
        self.assertNotIn("${{", detect["run"])

    def test_planner_handles_events_and_reports_diff_failures(self):
        script = workflow()["jobs"]["changes"]["steps"][1]["run"]
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "outputs"
            for event, base, head, success in (
                ("workflow_dispatch", "", "", True),
                ("push", "0" * 40, "HEAD", True),
                ("pull_request", "HEAD", "HEAD", True),
                ("push", "missing-ci-base", "HEAD", False),
            ):
                with self.subTest(event=event, base=base):
                    output.write_text("")
                    env = {
                        **os.environ,
                        "EVENT_NAME": event,
                        "BASE_SHA": base,
                        "HEAD_SHA": head,
                        "GITHUB_OUTPUT": str(output),
                    }
                    result = subprocess.run(
                        ["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", script],
                        cwd=ROOT, env=env, capture_output=True, text=True, check=False,
                    )
                    self.assertEqual(result.returncode == 0, success, result.stderr)
                    if success:
                        self.assertEqual(output.read_text(), "bootstrap=true\n")

    def test_bootstrap_waits_for_static_and_uses_the_plan(self):
        jobs = workflow()["jobs"]
        self.assertNotIn("if", jobs["static"])
        for name in BOOTSTRAP_JOBS:
            with self.subTest(job=name):
                self.assertEqual(set(jobs[name]["needs"]), {"changes", "static"})
                self.assertEqual(
                    jobs[name]["if"], "needs.changes.outputs.bootstrap == 'true'"
                )

    def test_required_check_observes_every_job_even_after_failure(self):
        jobs = workflow()["jobs"]
        result = jobs["ci-result"]
        self.assertEqual(result["name"], "ci-result")
        self.assertEqual(result["if"], "${{ always() }}")
        self.assertEqual(set(result["needs"]), set(jobs) - {"ci-result"})
        self.assertEqual(
            result["steps"][-1]["env"]["NEEDS_JSON"], "${{ toJSON(needs) }}"
        )
        self.assertEqual(
            result["steps"][-1]["run"], "python3 scripts/ci/ci-policy.py check"
        )
        for job in jobs.values():
            self.assertNotIn("continue-on-error", job)
            for step in job.get("steps", []):
                self.assertNotIn("continue-on-error", step)


class PolicyTests(unittest.TestCase):
    def run_policy(self, mode, data=b"", *, needs=None, full=False):
        env = dict(os.environ)
        if needs is not None:
            env["NEEDS_JSON"] = json.dumps(needs)
        return subprocess.run(
            [sys.executable, str(POLICY), mode, *(["--full"] if full else [])],
            input=data,
            capture_output=True,
            env=env,
            check=False,
        )

    def plan(self, paths, *, full=False):
        data = b"".join(os.fsencode(path) + b"\0" for path in paths)
        result = self.run_policy("plan", data, full=full)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.decode().strip()

    def test_documentation_and_ci_tests_only_need_static_validation(self):
        self.assertEqual(
            self.plan(
                [
                    "README.md",
                    "docs/ci.md",
                    "docs/setup-linux.md",
                    "TODO.md",
                    "AGENTS.md",
                    "CLAUDE.md",
                    ".github/CODEOWNERS",
                    ".gitignore",
                    "renovate.jsonc",
                    "scripts/ci/test-install.py",
                ]
            ),
            "bootstrap=false",
        )

    def test_runtime_and_unknown_paths_select_all_bootstrap_jobs(self):
        for path in (
            "install.sh",
            "mise.toml",
            "mise/config.toml",
            "mise.lock",
            "scripts/apply.sh",
            ".chezmoiignore",
            ".github/workflows/ci.yml",
            "scripts/ci/ci-policy.py",
            "dot_config/nvim/README.md",
            "dot_agents/skills/example/SKILL.md",
            "dot_config/zsh/aliases.zsh",
            "unknown-file",
            "README.md\ninstall.sh",
            "a file with spaces",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.plan(["docs/ci.md", path]), "bootstrap=true")

    def test_empty_and_forced_plans_run_everything(self):
        self.assertEqual(self.plan([]), "bootstrap=true")
        self.assertEqual(self.plan(["docs/ci.md"], full=True), "bootstrap=true")

    def test_rejects_truncated_nul_input(self):
        result = self.run_policy("plan", b"docs/ci.md")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"NUL", result.stderr)

    def needs(self, bootstrap):
        return {
            "changes": {"result": "success", "outputs": {"bootstrap": bootstrap}},
            "static": {"result": "success"},
            **{
                name: {"result": "success" if bootstrap == "true" else "skipped"}
                for name in BOOTSTRAP_JOBS
            },
        }

    def test_accepts_only_successful_selected_jobs_and_intentional_skips(self):
        for bootstrap in ("true", "false"):
            with self.subTest(bootstrap=bootstrap):
                result = self.run_policy("check", needs=self.needs(bootstrap))
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_failures_cancellations_and_unexpected_skips_fail_required_check(self):
        for bootstrap in ("true", "false"):
            good = self.needs(bootstrap)
            for name in good:
                for state in ("failure", "cancelled", "skipped"):
                    if (
                        bootstrap == "false"
                        and name in BOOTSTRAP_JOBS
                        and state == "skipped"
                    ):
                        continue
                    with self.subTest(bootstrap=bootstrap, job=name, state=state):
                        needs = copy.deepcopy(good)
                        needs[name]["result"] = state
                        result = self.run_policy("check", needs=needs)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn(name.encode(), result.stderr)

    def test_missing_plan_or_job_fails_required_check(self):
        for plan in ("", "TRUE", None):
            with self.subTest(plan=plan):
                result = self.run_policy("check", needs=self.needs(plan))
                self.assertNotEqual(result.returncode, 0)
        for job in self.needs("true"):
            with self.subTest(job=job):
                needs = self.needs("true")
                del needs[job]
                result = self.run_policy("check", needs=needs)
                self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
