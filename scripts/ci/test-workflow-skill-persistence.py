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
    "context-handoff": "conditional",
    "security-audit": "required",
    "todo-management": "required",
    "evidence-review": "none",
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
        r"^### Canonical persistence policy registry\s*$", document, re.MULTILINE
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

        routed_owners = re.findall(
            r"^\|[^|]+\| `([^`]+)` \|$", document, re.MULTILINE
        )
        policy_table = {
            row["Canonical owner"].strip("`"): row["Persistence"].strip("`")
            for row in rows
        }
        policy_owners = [row["Canonical owner"].strip("`") for row in rows]
        self.assertEqual(
            len(routed_owners),
            len(set(routed_owners)),
            "each canonical workflow must occur exactly once in the route table",
        )
        self.assertEqual(set(routed_owners), set(EXPECTED_POLICIES))
        self.assertEqual(
            len(policy_owners),
            len(set(policy_owners)),
            "each canonical workflow must occur exactly once in the policy registry",
        )
        self.assertEqual(set(policy_owners), set(EXPECTED_POLICIES))
        self.assertEqual(policy_table, EXPECTED_POLICIES)

        policy_rows = {
            row["Canonical owner"].strip("`"): row for row in rows
        }
        self.assertEqual(
            policy_rows["context-handoff"],
            {
                "Canonical owner": "`context-handoff`",
                "Persistence": "`conditional`",
                "Destination": "`.dev/contexts/<task-key>.md` only for an explicit export or save request; import and inspect are read-only",
                "Checkpoint": "Export checkpoints identity, snapshot, and each material decision; import resolves without `--ensure` and creates no state",
                "Completion": "Export verifies a readable handoff; import reports reconciled provenance and freshness without writing",
                "Promotion": "Only a separate explicit owner action may promote confirmed reusable facts",
            },
        )
        self.assertEqual(
            policy_rows["evidence-review"],
            {
                "Canonical owner": "`evidence-review`",
                "Persistence": "`none`",
                "Destination": "Prospective `.dev/reviews/<review-key>.md`; runtime persistence is unavailable until `.dev/todo/skill-driven-workflow-persistence.md` completes writer integration",
                "Checkpoint": "No durable review checkpoint while runtime support is unavailable; keep the prospective snapshot contract for that integration",
                "Completion": "Return the full report in chat and state that no review artifact was persisted",
                "Promotion": "No promotion; a later explicit request must route to the canonical owner after support exists",
            },
        )

        for row in rows:
            owner = row["Canonical owner"]
            for field in ("Destination", "Checkpoint", "Completion", "Promotion"):
                self.assertTrue(
                    row[field].strip(),
                    f"{owner} must define nonempty {field.lower()} behavior",
                )

        self.assertRegex(
            guardrail_text,
            r"(?is)required\s+means\s+the\s+explicitly\s+requested\s+outcome\s+is\s+itself\s+a\s+managed\s+state\s+write",
            "required routes must be selected specifically for a managed state-write outcome",
        )
        self.assertRegex(
            guardrail_text,
            r"(?is)conditional\s+means\s+the\s+owner\s+has\s+both\s+write\s+and\s+read-only\s+or\s+nonpersistent\s+modes.*?read-only\s+mode\s+never\s+authorizes\s+a\s+write",
            "conditional routes must distinguish write authorization from read-only modes",
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

    def test_evidence_review_is_conversation_first_and_runtime_persistence_is_gated(self) -> None:
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
            r"(?is)runtime\s+persistence\s+is\s+unavailable",
            "review persistence must be explicitly unavailable at runtime",
        )
        self.assertIn(
            ".dev/todo/skill-driven-workflow-persistence.md",
            contract,
            "the unavailable runtime integration must name its stable active work item",
        )
        self.assertRegex(
            contract,
            r"(?is)(?:even|neither).*?explicit\s+persistence\s+authorization.*?(?:cannot|does\s+not).*?(?:write|override|authorize)",
            "explicit persistence authorization must not bypass unavailable writer support",
        )
        self.assertRegex(
            contract,
            r"(?is)shared\s+workflow-state\s+writer.*?(?:rejects|does\s+not\s+accept).*?\.dev/reviews",
            "the contract must state that the current shared writer rejects review paths",
        )
        self.assertRegex(
            contract,
            r"(?is)full\s+report\s+in\s+chat.*?not\s+persisted|not\s+persisted.*?full\s+report\s+in\s+chat",
            "an unavailable persistence request must fall back to chat with an explicit not-persisted result",
        )
        self.assertRegex(
            contract,
            r"(?is)prospective\s+contract.*?does\s+not\s+authorize\s+a\s+current\s+write",
            "the artifact contract must remain prospective rather than executable",
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
            "Repository identity method",
            "Repository identity digest",
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
        self.assertNotRegex(
            readme,
            r"(?m)^Repository identity:",
            "the schema must not permit a raw repository identity value",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)Repository\s+identity\s+digest.*?64-character\s+lowercase\s+hexadecimal\s+SHA-256",
            "repository identity must be a normalized lowercase SHA-256 digest",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)remote\.origin\.url:.*?no\s+final\s+newline.*?git-common-dir:",
            "identity hashing must use the method-prefixed remote or Git-common-dir source bytes",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)never\s+store.*?raw\s+remote\s+URL.*?credential",
            "review artifacts must never store raw remote URLs or credentials",
        )

        snapshot_match = re.search(
            r"(?ms)^```text\n(review-snapshot/v1 NUL\n.*?)^```$", readme
        )
        self.assertIsNotNone(
            snapshot_match,
            "the contract must define the exact review-snapshot/v1 byte stream",
        )
        self.assertEqual(
            snapshot_match.group(1).splitlines(),
            [
                "review-snapshot/v1 NUL",
                "<full source HEAD SHA> NUL",
                "<full ref or literal detached> NUL",
                "<review mode literal change-review or dependency-update> NUL",
                "<sha256:<64 lowercase hex> of exact target descriptor UTF-8 bytes> NUL",
                "<sha256:<64 lowercase hex> of raw status-v2 -z bytes> NUL",
                "<sha256:<64 lowercase hex> or literal absent or omitted for committed target diff> NUL",
                "<sha256:<64 lowercase hex> or literal absent or omitted for staged diff> NUL",
                "<sha256:<64 lowercase hex> or literal absent or omitted for unstaged diff> NUL",
                "<sha256:<64 lowercase hex> or literal absent or omitted for authorized untracked content> NUL",
            ],
        )
        self.assertRegex(
            readme_contract,
            r"(?is)NUL\s+is\s+one\s+zero\s+byte.*?fixed\s+order.*?no\s+final\s+newline.*?final\s+NUL",
            "snapshot framing must define exact byte encoding and termination",
        )
        self.assertRegex(
            readme_contract,
            r"(?is)content\s+digest\s+token.*?sha256:.*?64\s+lowercase.*?literal\s+absent.*?literal\s+omitted",
            "snapshot components must have exact digest encoding and absence markers",
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
