#!/usr/bin/env python3

"""Verify canonical workflow skills materialize without client copies."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_SKILLS = ROOT / "dot_agents/skills"
CLAUDE_SKILLS = ROOT / "dot_claude/skills"
CI_WORKFLOW = ROOT / ".github/workflows/ci.yml"
CI_COMMAND = "mise exec -- python3 scripts/ci/test-workflow-skill-materialization.py"


def canonical_names() -> set[str]:
    return {
        path.name
        for path in CANONICAL_SKILLS.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }


class WorkflowSkillMaterializationTests(unittest.TestCase):
    def test_clients_share_one_canonical_source_and_ci_runs_this_test(self) -> None:
        names = canonical_names()
        self.assertTrue(names, "canonical workflow skill set must not be empty")

        pointer_names = {
            path.name.removeprefix("symlink_")
            for path in CLAUDE_SKILLS.glob("symlink_*")
            if path.is_file()
        }
        self.assertEqual(pointer_names, names)
        for name in names:
            pointer = CLAUDE_SKILLS / f"symlink_{name}"
            self.assertEqual(
                pointer.read_text(encoding="utf-8").strip(),
                f"../../.agents/skills/{name}",
            )

        for client_root in (
            ROOT / "dot_claude",
            ROOT / "dot_codex",
            ROOT / "dot_config/opencode",
        ):
            self.assertEqual(
                list(client_root.rglob("SKILL.md")),
                [],
                f"{client_root.relative_to(ROOT)} must not copy canonical skills",
            )

        self.assertIn(CI_COMMAND, CI_WORKFLOW.read_text(encoding="utf-8"))

    def test_chezmoi_materializes_claude_links_to_canonical_skills(self) -> None:
        names = canonical_names()
        chezmoi = subprocess.check_output(
            ["mise", "which", "chezmoi"], text=True
        ).strip()
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            destination = temp / "home"
            destination.mkdir()
            (destination / ".agents").mkdir()
            (destination / ".claude/skills").mkdir(parents=True)
            state = temp / "state.boltdb"
            environment = os.environ.copy()
            environment.update(
                {
                    "HOME": str(destination),
                    "XDG_CACHE_HOME": str(temp / "cache"),
                    "XDG_CONFIG_HOME": str(temp / "config"),
                    "XDG_DATA_HOME": str(temp / "data"),
                }
            )

            common = [
                chezmoi,
                "--source",
                str(ROOT),
                "--destination",
                str(destination),
                "--persistent-state",
                str(state),
                "--no-tty",
                "apply",
            ]
            for target in (".agents/skills", ".claude/skills"):
                subprocess.run(
                    [*common, target],
                    check=True,
                    capture_output=True,
                    text=True,
                    env=environment,
                    cwd=destination,
                )

            deployed_canonical = destination / ".agents/skills"
            self.assertEqual(
                {path.name for path in deployed_canonical.iterdir() if path.is_dir()},
                names,
            )
            for name in names:
                source = CANONICAL_SKILLS / name / "SKILL.md"
                deployed = deployed_canonical / name / "SKILL.md"
                self.assertEqual(deployed.read_bytes(), source.read_bytes())

                claude_link = destination / ".claude/skills" / name
                self.assertTrue(claude_link.is_symlink(), f"{name} must be a symlink")
                self.assertEqual(
                    os.readlink(claude_link), f"../../.agents/skills/{name}"
                )
                self.assertEqual(
                    (claude_link / "SKILL.md").read_bytes(), source.read_bytes()
                )

            self.assertFalse((destination / ".codex/skills").exists())
            self.assertFalse((destination / ".config/opencode/skills").exists())


if __name__ == "__main__":
    unittest.main()
