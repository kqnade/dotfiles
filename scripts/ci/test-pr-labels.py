#!/usr/bin/env python3
"""Validate PR label rules and the privileged workflow's execution boundary."""

from __future__ import annotations

import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]


def load_yaml(path):
    result = subprocess.run(
        ["yq", "-o=json", ".", str(ROOT / path)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


class LabelWorkflowTests(unittest.TestCase):
    def test_labeling_is_isolated_from_pr_code_and_test_execution(self):
        path = ROOT / ".github/workflows/pr-labels.yml"
        self.assertTrue(path.is_file(), "a dedicated PR label workflow is required")
        workflow = load_yaml(path)
        self.assertEqual(set(workflow["on"]), {"pull_request_target"})
        self.assertEqual(
            set(workflow["on"]["pull_request_target"]["types"]),
            {"opened", "synchronize", "reopened", "edited"},
        )
        self.assertEqual(workflow["permissions"], {})
        self.assertEqual(set(workflow["jobs"]), {"label"})
        job = workflow["jobs"]["label"]
        self.assertEqual(
            job["permissions"],
            {
                "contents": "read",
                "pull-requests": "write",
                "issues": "write",
            },
        )
        self.assertEqual(job["runs-on"], "ubuntu-latest")
        self.assertLessEqual(job["timeout-minutes"], 5)
        self.assertEqual(len(job["steps"]), 1)
        step = job["steps"][0]
        self.assertRegex(step["uses"], r"^actions/labeler@[0-9a-f]{40}$")
        self.assertEqual(set(step), {"uses", "with"})
        self.assertEqual(
            step["with"],
            {
                "configuration-path": ".github/labeler.yml",
                "sync-labels": False,
            },
        )
        self.assertEqual(
            workflow["concurrency"]["group"],
            "pr-labels-${{ github.event.pull_request.number }}",
        )

    def test_ci_validates_labels_without_mutating_pull_requests(self):
        workflow = load_yaml(".github/workflows/ci.yml")
        commands = "\n".join(
            step.get("run", "") for step in workflow["jobs"]["static"]["steps"]
        )
        self.assertIn("mise exec -- python3 scripts/ci/test-pr-labels.py", commands)
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        for job in workflow["jobs"].values():
            self.assertNotIn("permissions", job)
            for step in job.get("steps", []):
                self.assertFalse(step.get("uses", "").startswith("actions/labeler@"))


class LabelRuleTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((ROOT / ".github/labeler.yml").is_file())
        self.config = load_yaml(".github/labeler.yml")
        self.assertEqual(
            set(self.config),
            {
                "ci",
                "shell",
                "dependencies",
                "documentation",
                "agents",
                "neovim",
            },
        )
        self.patterns = {}
        for label, rules in self.config.items():
            self.assertEqual(len(rules), 1)
            self.assertEqual(set(rules[0]), {"changed-files"})
            matchers = rules[0]["changed-files"]
            self.assertEqual(len(matchers), 1)
            self.assertEqual(set(matchers[0]), {"any-glob-to-any-file"})
            patterns = matchers[0]["any-glob-to-any-file"]
            self.assertIsInstance(patterns, list)
            self.assertTrue(patterns)
            for pattern in patterns:
                self.assertIsNone(re.search(r"[!{}\[\]?()]", pattern))
            self.patterns[label] = patterns

    def labels_for(self, paths):
        return {
            label
            for label, patterns in self.patterns.items()
            if any(
                PurePosixPath(path).full_match(pattern)
                for path in paths
                for pattern in patterns
            )
        }

    def test_representative_paths_receive_the_expected_labels(self):
        examples = {
            ".github/workflows/ci.yml": {"ci"},
            "scripts/ci/test-pr-labels.py": {"ci"},
            "dot_config/zsh/functions/wt.zsh": {"shell"},
            "dot_zshrc": {"shell"},
            "install.sh": {"shell"},
            "mise.lock": {"dependencies"},
            "mise/config.toml": {"dependencies"},
            "README.md": {"documentation"},
            "docs/ci.md": {"documentation"},
            "dot_agents/skills/test-driven-development/SKILL.md": {
                "documentation",
                "agents",
            },
            "dot_pi/agent/settings.json.tmpl": {"agents"},
            "dot_config/nvim/lua/core/keymaps.lua": {"neovim"},
            "dot_config/nvim/lazy-lock.json": {"dependencies", "neovim"},
            "unclassified-file": set(),
        }
        for path, expected in examples.items():
            with self.subTest(path=path):
                self.assertEqual(self.labels_for([path]), expected)

    def test_mixed_changes_receive_multiple_labels(self):
        self.assertEqual(
            self.labels_for([".github/labeler.yml", "docs/ci.md", "mise.toml"]),
            {"ci", "documentation", "dependencies"},
        )


if __name__ == "__main__":
    unittest.main()
