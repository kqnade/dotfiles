#!/usr/bin/env python3

"""Verify canonical workflow skills materialize without client copies."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from validate_common import EXPECTED_AGENT_SKILLS, LEGACY_AGENT_SKILLS


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_SKILLS = ROOT / "dot_agents/skills"
CLAUDE_SKILLS = ROOT / "dot_claude/skills"
CI_WORKFLOW = ROOT / ".github/workflows/ci.yml"
CI_COMMAND = "mise exec -- python3 scripts/ci/test-workflow-skill-materialization.py"
RETAINED_SKILL_NAMES = {
    "test-driven-development",
    "evidence-review",
    "sanitize-artifacts",
    "using-workflow-skills",
    "context-handoff",
    "todo-management",
}
RETIRED_ROUTER_OWNERS = {
    "assumption-pruning",
    "execute-worktree-implementation",
    "herdr",
    "peer-consultation",
    "prose-proofreading",
    "route-large-implementation",
    "security-audit",
}


def canonical_names() -> set[str]:
    return {
        path.name
        for path in CANONICAL_SKILLS.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }


class WorkflowSkillMaterializationTests(unittest.TestCase):
    def test_retained_router_has_no_retired_active_routes(self) -> None:
        router = (CANONICAL_SKILLS / "using-workflow-skills/SKILL.md").read_text(
            encoding="utf-8"
        )
        review = (CANONICAL_SKILLS / "evidence-review/SKILL.md").read_text(
            encoding="utf-8"
        )
        for owner in RETIRED_ROUTER_OWNERS:
            self.assertNotIn(
                f"`{owner}`",
                router,
                f"router must not invoke retired owner {owner}",
            )
            self.assertNotIn(
                f"`{owner}`",
                review,
                f"review skill must not invoke retired owner {owner}",
            )
        for name in RETAINED_SKILL_NAMES - {"using-workflow-skills"}:
            self.assertIn(f"`{name}`", router)

    def test_clients_share_one_canonical_source_and_ci_runs_this_test(self) -> None:
        names = canonical_names()
        self.assertTrue(names, "canonical workflow skill set must not be empty")
        self.assertEqual(names, EXPECTED_AGENT_SKILLS | LEGACY_AGENT_SKILLS)
        self.assertTrue(RETAINED_SKILL_NAMES <= EXPECTED_AGENT_SKILLS)

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
            temp = Path(temp_dir).resolve()
            destination = temp / "home"
            destination.mkdir()
            (destination / ".agents").mkdir()
            (destination / ".claude/skills").mkdir(parents=True)
            (destination / ".pi/agent").mkdir(parents=True)
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
            for target in (
                ".agents/skills",
                ".claude/skills",
                ".pi/agent/AGENTS.md",
            ):
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

            deployed_pi_global = destination / ".pi/agent/AGENTS.md"
            self.assertTrue(deployed_pi_global.is_file())
            deployed_pi_global_text = deployed_pi_global.read_text(encoding="utf-8")
            self.assertNotIn("{{ include", deployed_pi_global_text)
            for shared_rule in (
                ROOT / "dot_agents/rules/coding.md",
                ROOT / "dot_agents/rules/workflow-state.md",
                ROOT / "dot_agents/rules/git.md",
            ):
                self.assertIn(
                    shared_rule.read_text(encoding="utf-8").strip(),
                    deployed_pi_global_text,
                )
            self.assertIn("# Pi agent contract", deployed_pi_global_text)


if __name__ == "__main__":
    unittest.main()
