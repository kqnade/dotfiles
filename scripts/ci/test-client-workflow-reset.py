#!/usr/bin/env python3

"""Verify portable workflow skills and removal of retired managed targets."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SKILLS = {"test-driven-development", "evidence-review", "context-handoff", "sanitize-artifacts"}


class ClientWorkflowResetTests(unittest.TestCase):
    def test_sources_deploy_only_the_curated_skills(self) -> None:
        shared = ROOT / "dot_agents/skills"
        self.assertEqual({path.name for path in shared.glob("*")}, SKILLS)
        self.assertEqual(
            {path.name for path in (ROOT / "dot_claude/skills").glob("*")},
            {f"symlink_{name}" for name in SKILLS},
        )
        self.assertFalse((ROOT / "dot_agents/rules").exists())
        instructions = (ROOT / "dot_agents/AGENTS.md").read_text()
        for heading in (
            "Coding", "Delegation", "Local commits",
            "Remote changes require explicit authorization", "Repository workflow state",
        ):
            self.assertIn(f"# {heading}\n", instructions)
        self.assertEqual(
            (ROOT / "dot_pi/agent/symlink_AGENTS.md").read_text().strip(),
            "../../.agents/AGENTS.md",
        )
        self.assertEqual(list(shared.glob("*/scripts")), [])
        self.assertFalse((ROOT / "dot_codex/agents").exists())
        self.assertFalse((ROOT / "dot_codex/symlink_AGENTS.md").exists())
        self.assertFalse((ROOT / "dot_config/opencode/symlink_AGENTS.md").exists())
        codex_modifier = (ROOT / "dot_codex/modify_private_config.toml").read_text()
        self.assertNotIn(".agents.default_subagent_model =", codex_modifier)
        self.assertEqual(
            {path.name for path in (ROOT / "dot_claude/rules").iterdir()},
            {"operations.md"},
        )

    def test_pi_model_cycle_contains_the_three_primary_models(self) -> None:
        settings = json.loads((ROOT / "dot_pi/agent/settings.json").read_text())
        self.assertEqual(settings["enabledModels"], [
            "openai-codex/gpt-6-astra",
            "openai-codex/gpt-6-sol",
            "openai-codex/gpt-6-luna",
        ])
        self.assertEqual(settings["defaultModel"], "gpt-6-sol")
        self.assertEqual(settings["defaultThinkingLevel"], "xhigh")
        self.assertEqual(settings["subagents"]["defaultThinking"], "max")
        for name in ("worker", "delegate", "scout", "researcher", "evidence-auditor"):
            self.assertEqual(settings["subagents"]["agentOverrides"][name]["thinking"], "max")
        self.assertEqual(
            settings["subagents"]["agentOverrides"]["scout"]["model"],
            "openai-codex/gpt-6-luna",
        )
        for name in ("reviewer", "oracle"):
            self.assertEqual(settings["subagents"]["agentOverrides"][name]["model"], "openai-codex/gpt-6-sol")
            self.assertEqual(settings["subagents"]["agentOverrides"][name]["thinking"], "high")
        for model, thinking in (("astra", "medium"), ("sol", "xhigh"), ("luna", "max")):
            self.assertEqual(settings["modelThinkingLevels"][f"openai-codex/gpt-6-{model}"], thinking)

    def test_skill_metadata_and_references_are_portable(self) -> None:
        for name in sorted(SKILLS):
            with self.subTest(skill=name):
                source = ROOT / "dot_agents/skills" / name / "SKILL.md"
                content = source.read_text()
                self.assertTrue(content.startswith("---\n"))
                _, frontmatter, body = content.split("---\n", 2)
                metadata = dict(line.split(": ", 1) for line in frontmatter.splitlines())
                self.assertEqual(set(metadata), {"name", "description"})
                self.assertEqual(metadata["name"], name)
                self.assertTrue(0 < len(metadata["description"]) <= 1024)
                for reference in re.findall(r"\]\(([^)]+)\)", body):
                    self.assertTrue((source.parent / reference).is_file(), reference)
                self.assertEqual(
                    (ROOT / "dot_claude/skills" / f"symlink_{name}").read_text().strip(),
                    f"../../.agents/skills/{name}",
                )

    def test_sanitize_artifacts_contract_is_unchanged_and_required(self) -> None:
        content = (ROOT / "dot_agents/skills/sanitize-artifacts/SKILL.md").read_bytes()
        self.assertEqual(
            hashlib.sha256(content).hexdigest(),
            "5360c17c724e2d443320a2faada7053b4d5ccd560452638d02283ec764a52166",
        )
        for name in ("test-driven-development", "evidence-review"):
            content = (ROOT / "dot_agents/skills" / name / "SKILL.md").read_text()
            self.assertIn("../sanitize-artifacts/SKILL.md", content)
            self.assertIn("blocking", content)

    def test_reset_removes_known_targets_but_preserves_unknown_home_files(self) -> None:
        chezmoi = subprocess.check_output(
            ["mise", "which", "chezmoi"], text=True
        ).strip()
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory).resolve()
            home = temporary / "home"
            home.mkdir()
            old_targets = {
                ".agents/rules/coding.md": "old shared rule\n",
                ".agents/skills/assumption-pruning/SKILL.md": "old skill\n",
                ".agents/skills/context-handoff/scripts/context-candidates": "old helper\n",
                ".agents/skills/using-workflow-skills/SKILL.md": "old router\n",
                ".agents/skills/todo-management/scripts/todo-obligation": "old ledger helper\n",
                ".agents/skills/evidence-review/agents/openai.yaml": "old metadata\n",
                ".claude/skills/using-workflow-skills": "old router link\n",
                ".claude/skills/assumption-pruning": "old Claude link\n",
                ".claude/rules/delivery.md": "old Claude rule\n",
                ".codex/AGENTS.md": "old Codex rules\n",
                ".codex/agents/luna-parallelizer.toml": "old Codex agent\n",
                ".config/opencode/AGENTS.md": "old OpenCode rules\n",
                ".pi/agent/extensions/btw.ts": "old side conversation entry\n",
                ".pi/agent/extensions/lib/btw-session.mjs": "old side session factory\n",
                ".pi/agent/extensions/lib/vendor/pi-btw.ts": "old side conversation implementation\n",
                ".pi/agent/extensions/lib/vendor/pi-btw.LICENSE": "old vendor license\n",
                ".pi/agent/extensions/lib/vendor/README.md": "old vendor documentation\n",
            }
            for relative, contents in old_targets.items():
                target = home / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(contents)
            claude_link = home / ".claude/skills/assumption-pruning"
            claude_link.unlink()
            claude_link.symlink_to("../../.agents/skills/assumption-pruning")
            preserved = {
                ".agents/rules/user.md": "user rule\n",
                ".agents/skills/user/SKILL.md": "user skill\n",
                ".agents/skills/assumption-pruning/user.md": "user notes\n",
                ".agents/skills/context-handoff/user.md": "user handoff notes\n",
                ".pi/agent/auth.json": '{"test": "runtime credential placeholder"}\n',
                ".pi/agent/sessions/example.jsonl": '{"type": "session"}\n',
                ".pi/agent/extensions/user.ts": "user extension\n",
                ".pi/agent/extensions/lib/vendor/user.ts": "user vendor file\n",
                ".claude/rules/user.md": "user Claude rule\n",
                ".codex/agents/user.toml": "user Codex agent\n",
                ".config/opencode/user.md": "user OpenCode file\n",
                ".config/herdr/user.toml": "user Herdr file\n",
            }
            for relative, contents in preserved.items():
                target = home / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(contents)
            existing_pi_instructions = home / ".pi/agent/AGENTS.md"
            existing_pi_instructions.parent.mkdir(parents=True, exist_ok=True)
            existing_pi_instructions.write_text("pre-existing Pi instructions\n")

            environment = os.environ.copy()
            environment.update(
                {
                    "HOME": str(home),
                    "XDG_CACHE_HOME": str(temporary / "cache"),
                    "XDG_CONFIG_HOME": str(temporary / "config"),
                    "XDG_DATA_HOME": str(temporary / "data"),
                }
            )
            for name in ("test-driven-development", "sanitize-artifacts"):
                target = home / ".agents/skills" / name / "SKILL.md"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("outdated managed skill\n")
                link = home / ".claude/skills" / name
                link.symlink_to(f"../../.agents/skills/{name}")

            for _ in range(2):
                result = subprocess.run(
                    [
                        chezmoi,
                        "--source",
                        str(ROOT),
                        "--destination",
                        str(home),
                        "--persistent-state",
                        str(temporary / "state.boltdb"),
                        "--no-tty",
                        "apply",
                    ],
                    cwd=home,
                    env=environment,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                for relative in old_targets:
                    self.assertFalse(os.path.lexists(home / relative), relative)
                for relative, contents in preserved.items():
                    self.assertEqual((home / relative).read_text(), contents, relative)
                pi_instructions = home / ".pi/agent/AGENTS.md"
                self.assertTrue(pi_instructions.is_symlink())
                self.assertEqual(
                    pi_instructions.resolve(), (home / ".agents/AGENTS.md").resolve()
                )
                self.assertEqual(pi_instructions.read_bytes(), (ROOT / "dot_agents/AGENTS.md").read_bytes())
                for name in SKILLS:
                    canonical = home / ".agents/skills" / name / "SKILL.md"
                    source = ROOT / "dot_agents/skills" / name / "SKILL.md"
                    self.assertEqual(canonical.read_bytes(), source.read_bytes())
                    link = home / ".claude/skills" / name
                    self.assertTrue(link.is_symlink())
                    self.assertEqual((link / "SKILL.md").resolve(), canonical.resolve())
                    for reference in re.findall(r"\]\(([^)]+)\)", canonical.read_text()):
                        self.assertTrue((link / reference).is_file(), reference)
                self.assertFalse((home / ".pi/agent/skills/test-driven-development").exists())

    def test_codex_migration_preserves_runtime_state(self) -> None:
        yq = subprocess.check_output(["mise", "which", "yq"], text=True).strip()
        environment = os.environ.copy()
        environment["PATH"] = str(Path(yq).parent) + os.pathsep + environment["PATH"]
        environment.pop("NEW_RELIC_LICENSE_KEY", None)
        config = '''
[agents]
max_concurrent_threads_per_session = 8
default_subagent_model = "gpt-5.6-luna"
default_subagent_reasoning_effort = "max"
[agents.user]
config_file = "agents/user.toml"
[projects."/user/project"]
trust_level = "trusted"
'''
        result = subprocess.run(
            ["bash", str(ROOT / "dot_codex/modify_private_config.toml")],
            input=config, text=True, capture_output=True, env=environment, check=True,
        )
        rendered = tomllib.loads(result.stdout)
        self.assertEqual(rendered["agents"], {"user": {"config_file": "agents/user.toml"}})
        self.assertEqual(rendered["projects"]["/user/project"]["trust_level"], "trusted")

    def test_operational_settings_and_authorization_remain(self) -> None:
        rendered = subprocess.check_output(
            [
                "chezmoi", "--source", str(ROOT), "execute-template", "--file",
                str(ROOT / ".chezmoitemplates/claude-settings.json.tmpl"),
            ],
            text=True,
        )
        settings = json.loads(rendered)
        self.assertEqual(settings["model"], "claude-opus-5-5[1m]")
        self.assertEqual(settings["preferredNotifChannel"], "notifications_disabled")
        commands = {
            hook["command"]
            for groups in settings["hooks"].values()
            for group in groups
            for hook in group["hooks"]
        }
        self.assertIn("~/.claude/hooks/authorize-repository.sh", commands)
        self.assertIn("~/.claude/hooks/notify.sh", commands)


if __name__ == "__main__":
    unittest.main()
