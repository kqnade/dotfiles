#!/usr/bin/env python3

"""Regression tests for the workflow router's persistence registry."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ROUTER = ROOT / "dot_agents/skills/using-workflow-skills/SKILL.md"
EVIDENCE_REVIEW = ROOT / "dot_agents/skills/evidence-review/SKILL.md"
REVIEWS_README = ROOT / ".dev/reviews/README.md"

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

    def test_evidence_review_is_conversation_first_and_separately_persisted(self) -> None:
        self.assertTrue(
            REVIEWS_README.is_file(),
            "evidence-review persistence contract must have a current-worktree README",
        )
        skill = EVIDENCE_REVIEW.read_text(encoding="utf-8")
        readme = REVIEWS_README.read_text(encoding="utf-8")
        contract = f"{skill}\n{readme}".replace("`", "")
        readme_contract = readme.replace("`", "")

        self.assertRegex(
            contract,
            r"(?is)full\s+review\s+report.*?returned\s+in\s+chat|return\s+the\s+review\s+in\s+chat",
            "evidence-review must remain conversation-first by default",
        )
        self.assertRegex(
            contract,
            r"(?is)separate\s+explicit\s+persistence\s+authorization",
            "persistence must require separate explicit authorization",
        )
        self.assertRegex(
            contract,
            r"(?is)current\s+worktree.*?\.dev/reviews/<review-key>\.md",
            "persisted reviews must be scoped to the current-worktree review path",
        )
        self.assertRegex(
            contract,
            r"(?is)stable\s+lowercase\s+review\s+key",
            "persisted reviews must define a stable lowercase review key",
        )

        self.assertIn(
            "Record schema: evidence-review/v1",
            readme,
            "persisted reviews must declare the evidence-review/v1 schema",
        )
        for field in (
            "Review key",
            "Repository identity",
            "Repository root",
            "Source worktree",
            "Source ref",
            "Source commit",
            "Dirty worktree",
            "Review mode",
            "Exact target",
            "Snapshot hash",
            "Snapshot components",
            "Created",
            "Updated",
            "Producing client",
            "Authorization source",
            "Authorization scope",
            "Freshness",
            "Lifecycle",
            "Supersedes",
            "Disposition",
        ):
            self.assertRegex(
                readme,
                rf"(?m)^{re.escape(field)}:",
                f"schema must define the {field.lower()} field",
            )
        self.assertIn(
            "timestamp with timezone",
            readme,
            "schema timestamps must include a timezone",
        )

        for heading in (
            "## Findings",
            "## Provenance and confidence",
            "## Claim ledger",
            "## Commands and results",
            "## Skipped checks",
            "## Reconciliation",
            "## Uncertainty",
        ):
            self.assertIn(heading, readme, f"report body must include {heading}")

        self.assertRegex(
            readme_contract,
            r"(?is)checkpoint\s+only\s+after.*?snapshot.*?bound.*?thereafter\s+only\s+at\s+a\s+material\s+decision\s+or\s+a\s+failed\s+check",
            "checkpoints must follow snapshot binding and material decisions or failed checks",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)before\s+marking.*?completed.*?re-read.*?current\s+HEAD.*?every\s+snapshot\s+component.*?recompute.*?Snapshot\s+hash",
            "completion must revalidate the current head and snapshot",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)head\s+or\s+any\s+evidence\s+changed.*?remains\s+stale\s+or\s+incomplete",
            "changed evidence must remain stale or incomplete",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)Completed\s+records\s+are\s+immutable.*?separate\s+superseding\s+record",
            "completed records must be immutable and later targets must supersede them",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)new\s+record.*?Supersedes.*?prior.*?path.*?hash.*?prior\s+record\s+remains\s+unchanged",
            "supersession metadata must live in the new record without rewriting the prior record",
        )
        for guardrail in (
            r"(?is)not\s+automatically\s+loaded|never\s+load\s+them\s+as\s+memory",
            r"(?is)(?:active|create\s+a)\s+TODO",
            r"(?is)automatic\s+memory|memory",
            r"(?is)not\s+.*?promot|promote\s+findings\s+automatically",
        ):
            self.assertRegex(
                contract,
                guardrail,
                "review records must not be loaded, turned into TODOs, remembered, or promoted automatically",
            )
        self.assertRegex(
            contract,
            r"(?is)promotion\s+requires\s+a\s+separate\s+explicit\s+(?:request|request\s+and\s+routing).*?canonical\s+owner",
            "promotion must be separately requested and routed to its canonical owner",
        )


if __name__ == "__main__":
    unittest.main()
