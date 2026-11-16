#!/usr/bin/env python3
"""Verify portable skills, opt-in materialization, and safe managed file removal."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SKILLS = {path.parent.name for path in (ROOT / "dot_agents/skills").glob("*/SKILL.md")}


class ClientWorkflowResetTests(unittest.TestCase):
    def test_skill_metadata_and_references_are_portable(self):
        for name in sorted(SKILLS):
            with self.subTest(skill=name):
                source = ROOT / "dot_agents/skills" / name / "SKILL.md"
                content = source.read_text()
                self.assertTrue(content.startswith("---\n"))
                _, frontmatter, body = content.split("---\n", 2)
                metadata = dict(
                    line.split(": ", 1) for line in frontmatter.splitlines()
                )
                self.assertEqual(
                    set(metadata),
                    {
                        "name",
                        "description",
                        *({"license"} if name == "yomiyasu" else set()),
                    },
                )
                if name == "yomiyasu":
                    self.assertEqual(metadata["license"], "MIT")
                self.assertEqual(metadata["name"], name)
                self.assertTrue(0 < len(metadata["description"]) <= 1024)
                for reference in re.findall(r"\]\(([^)]+)\)", body):
                    self.assertTrue((source.parent / reference).is_file(), reference)
                self.assertEqual(
                    (ROOT / "dot_claude/skills" / f"symlink_{name}")
                    .read_text()
                    .strip(),
                    f"../../.agents/skills/{name}",
                )

    def test_repeated_apply_removes_known_targets_and_preserves_runtime_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            temp = Path(temporary).resolve()
            home = temp / "home"
            home.mkdir()
            removed = {
                ".agents/rules/coding.md",
                ".agents/skills/assumption-pruning/SKILL.md",
                ".agents/skills/context-handoff/scripts/context-candidates",
                ".claude/rules/delivery.md",
                ".claude/skills/assumption-pruning",
                ".pi/agent/AGENTS.md",
                ".pi/agent/settings.json",
                ".pi/agent/extensions/execution-guard.ts",
                ".pi/agent/extensions/lib/otlp.mjs",
                ".codex/config.toml",
                ".codex/AGENTS.md",
                ".config/opencode/opencode.json",
                ".config/opencode/AGENTS.md",
                ".config/deepseek-harness/personal/package.json",
                ".dsh/personal/profiles/tui/package.json",
                ".local/bin/pi-telemetry",
                ".config/zsh/functions/dsh.zsh",
                ".local/bin/dsh-profile",
            }
            preserved = {
                ".agents/rules/user.md": "user rule\n",
                ".agents/skills/user/SKILL.md": "user skill\n",
                ".agents/skills/assumption-pruning/user.md": "user notes\n",
                ".pi/agent/auth.json": '{"credential":"placeholder"}\n',
                ".pi/agent/sessions/example.jsonl": '{"type":"session"}\n',
                ".pi/agent/extensions/user.ts": "user extension\n",
                ".codex/auth.json": '{"credential":"placeholder"}\n',
                ".codex/agents/user.toml": "user agent\n",
                ".config/opencode/user.md": "user configuration\n",
                ".config/deepseek-harness/work/user.yml": "user configuration\n",
                ".dsh/personal/.credentials.yaml": "credential: placeholder\n",
                ".dsh/personal/profiles/tui/cordis.patch.yml": "user setting\n",
                ".dsh/work/sessions/example.json": "{}\n",
                ".claude/rules/user.md": "user Claude rule\n",
            }
            for relative in removed | preserved.keys():
                path = home / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(preserved.get(relative, "outdated managed file\n"))
            link = home / ".claude/skills/assumption-pruning"
            link.unlink()
            link.symlink_to("../../.agents/skills/assumption-pruning")
            instructions = home / ".claude/CLAUDE.md"
            instructions.write_text("outdated managed instructions\n")
            environment = {
                **os.environ,
                "HOME": str(home),
                "XDG_CACHE_HOME": str(temp / "cache"),
                "XDG_CONFIG_HOME": str(temp / "config"),
                "XDG_DATA_HOME": str(temp / "data"),
            }
            for _ in range(2):
                result = subprocess.run(
                    [
                        "chezmoi",
                        "--source",
                        str(ROOT),
                        "--destination",
                        str(home),
                        "--override-data",
                        '{"claude_work_enabled":true}',
                        "--persistent-state",
                        str(temp / "state.boltdb"),
                        "--no-tty",
                        "apply",
                    ],
                    cwd=home,
                    env=environment,
                    text=True,
                    capture_output=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                for relative in removed:
                    self.assertFalse(os.path.lexists(home / relative), relative)
                for relative, contents in preserved.items():
                    self.assertEqual((home / relative).read_text(), contents, relative)
                self.assertTrue(instructions.is_symlink())
                self.assertEqual(
                    instructions.read_bytes(),
                    (ROOT / "dot_agents/AGENTS.md").read_bytes(),
                )
                for name in SKILLS:
                    source = ROOT / "dot_agents/skills" / name
                    deployed = home / ".agents/skills" / name
                    for path in source.rglob("*"):
                        if path.is_file() and "__pycache__" not in path.parts:
                            self.assertEqual(
                                (deployed / path.relative_to(source)).read_bytes(),
                                path.read_bytes(),
                            )
                    link = home / ".claude/skills" / name
                    self.assertTrue(link.is_symlink())
                    self.assertEqual(
                        (link / "SKILL.md").resolve(), (deployed / "SKILL.md").resolve()
                    )
                    for reference in re.findall(
                        r"\]\(([^)]+)\)", (deployed / "SKILL.md").read_text()
                    ):
                        self.assertTrue((link / reference).is_file(), reference)
                self.assertTrue((home / ".config/dotfiles/client-runtime.sh").is_file())

            scripts = home / ".agents/skills/yomiyasu/scripts"
            for text, code, clean in (
                ("設定を保存しました。\n", 0, True),
                ("時間を溶かしました。\n", 1, False),
            ):
                lint = subprocess.run(
                    [
                        sys.executable,
                        "-B",
                        str(scripts / "yomiyasu_lint.py"),
                        "--json",
                        "--strict",
                    ],
                    input=text,
                    cwd=home,
                    text=True,
                    capture_output=True,
                )
                self.assertEqual(lint.returncode, code, lint.stderr)
                self.assertEqual(json.loads(lint.stdout)["is_clean"], clean)
            original = temp / "original.txt"
            rewritten = temp / "rewritten.txt"
            original.write_text("設定を保存しました。\n")
            rewritten.write_bytes(original.read_bytes())
            diff = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(scripts / "yomiyasu_diff.py"),
                    str(original),
                    str(rewritten),
                    "--json",
                    "--stance=説明",
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(diff.returncode, 0, diff.stderr)
            data = json.loads(diff.stdout)
            for key in (
                "markers",
                "new_words",
                "lost_words",
                "structure",
                "spans",
                "bold",
            ):
                self.assertEqual(data[key], [], key)
            self.assertEqual(data["endings"]["changes"], [])


if __name__ == "__main__":
    unittest.main()
