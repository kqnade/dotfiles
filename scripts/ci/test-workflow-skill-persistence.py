#!/usr/bin/env python3

"""Regression tests for the workflow router's persistence registry."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ROUTER = ROOT / "dot_agents/skills/using-workflow-skills/SKILL.md"

EXPECTED_POLICIES = {
    "context-handoff": "required",
    "security-audit": "required",
    "todo-management": "required",
    "evidence-review": "conditional",
    "route-large-implementation": "none",
    "execute-worktree-implementation": "none",
    "test-driven-development": "none",
    "prose-proofreading": "none",
    "assumption-pruning": "none",
    "peer-consultation": "none",
    "herdr": "none",
}


def parse_registry_table(document: str) -> list[dict[str, str]]:
    heading = re.search(
        r"^### Canonical route and persistence registry\s*$", document, re.MULTILINE
    )
    if heading is None:
        raise AssertionError("router must declare a canonical route and persistence registry")

    remainder = document[heading.end() :]
    table_lines = []
    for line in remainder.splitlines():
        if line.lstrip().startswith("|"):
            table_lines.append(line.strip())
        elif table_lines:
            break
    if len(table_lines) < 3:
        raise AssertionError("canonical registry must contain a header, separator, and rows")

    header = [cell.strip() for cell in table_lines[0].strip("|").split("|")]
    if not all(re.fullmatch(r":?-{3,}:?", cell) for cell in table_lines[1].strip("|").split("|")):
        raise AssertionError("canonical registry must use a Markdown table separator")

    rows = []
    for line in table_lines[2:]:
        values = [cell.strip() for cell in line.strip("|").split("|")]
        if len(values) != len(header):
            raise AssertionError(f"canonical registry row has the wrong number of columns: {line}")
        rows.append(dict(zip(header, values, strict=True)))
    return rows


class WorkflowSkillPersistenceTests(unittest.TestCase):
    def test_registry_declares_exact_routes_policies_and_guardrails(self) -> None:
        document = ROUTER.read_text(encoding="utf-8")
        guardrail_text = document.replace("`", "")
        rows = parse_registry_table(document)
        required_columns = {
            "Task",
            "Canonical owner",
            "Persistence",
            "Destination",
            "Checkpoint",
            "Completion",
            "Promotion",
        }
        self.assertEqual(
            set(rows[0]),
            required_columns,
            "canonical registry must expose route and persistence columns",
        )

        route_table = {
            row["Canonical owner"].strip("`"): row["Task"] for row in rows
        }
        policy_table = {
            row["Canonical owner"].strip("`"): row["Persistence"].strip("`")
            for row in rows
        }
        self.assertEqual(
            len(route_table),
            len(rows),
            "each canonical workflow must occur exactly once in the route table",
        )
        self.assertEqual(set(route_table), set(EXPECTED_POLICIES))
        self.assertEqual(policy_table, EXPECTED_POLICIES)
        self.assertTrue(all(task.strip() for task in route_table.values()))

        for row in rows:
            owner = row["Canonical owner"]
            for field in ("Destination", "Checkpoint", "Completion", "Promotion"):
                self.assertTrue(
                    row[field].strip(),
                    f"{owner} must define nonempty {field.lower()} behavior",
                )

        self.assertRegex(
            guardrail_text,
            r"(?is)required\s+means\s+an\s+explicit invocation\s+authorizes\s+only\s+that owner's\s+exact\s+state write",
            "required routes must authorize only their owner's exact state write",
        )
        self.assertRegex(
            guardrail_text,
            r"(?is)conditional\s+means\s+the owner.*?separate\s+explicit\s+persistence\s+authorization",
            "conditional routes must require separate persistence authorization",
        )
        self.assertRegex(
            guardrail_text,
            r"(?is)none\s+means\s+no workflow-state\s+write",
            "none routes must not write workflow state",
        )
        self.assertRegex(guardrail_text, r"(?i)automatic memory is disabled")
        self.assertRegex(
            guardrail_text,
            r"(?is)stateless\s+single-session\s+work\s+does\s+not\s+create\s+an\s+active TODO",
            "stateless single-session work must not be forced into an active TODO",
        )


if __name__ == "__main__":
    unittest.main()
