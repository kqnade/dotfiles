#!/usr/bin/env python3

"""Validate TODO obligation behavior for workflow-state."""

from __future__ import annotations

import subprocess
from pathlib import Path
import os

from validate_common import fail

from validate_workflow_state_fixtures import ValidationContext


def validate_todo_obligations(context: ValidationContext) -> None:
    resolved_state = context.resolved_state
    state_test_env = context.state_test_env
    state_test_repo = context.state_test_repo
    state_test_root = context.state_test_root
    state_test_worktree = context.state_test_worktree
    todo_obligation_script = context.todo_obligation_script
    todo_path_script = context.todo_path_script
    workflow_state_writer = context.workflow_state_writer
    worktree_state = context.worktree_state

    worktree_todo_path = Path(
        subprocess.check_output(
            [str(todo_path_script), "workflow-state-repair"],
            cwd=state_test_worktree,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if worktree_todo_path.parent.exists():
        fail("read-only TODO resolution must not create another worktree's .dev")

    todo_path = Path(
        subprocess.check_output(
            [str(todo_path_script), "workflow-state-repair"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if todo_path != state_test_repo.resolve() / ".dev/todo/workflow-state-repair.md":
        fail("TODO path resolver must use the current worktree's .dev/todo")
    if worktree_todo_path == todo_path:
        fail("linked worktrees must not share active TODO paths")
    if todo_path.parent.exists():
        fail("read-only TODO path resolution must not create the todo directory")

    invalid_todo_path = subprocess.run(
        [str(todo_path_script), "Invalid/Todo"],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if invalid_todo_path.returncode == 0:
        fail("TODO path resolver must reject an invalid task key")

    external_todo_env = {
        **state_test_env,
        "AGENT_WORKFLOW_STATE_HOME": str(state_test_root / "external"),
    }
    external_todo_path = subprocess.run(
        [str(todo_path_script), "workflow-state-repair"],
        cwd=state_test_repo,
        env=external_todo_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if external_todo_path.returncode == 0:
        fail("TODO path resolver must reject external workflow-state redirection")

    ensured_todo_path = Path(
        subprocess.check_output(
            [str(todo_path_script), "--ensure", "workflow-state-repair"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if ensured_todo_path != todo_path or not todo_path.parent.is_dir():
        fail("TODO path resolver must create only the current worktree todo directory")

    first_todo = """# Workflow state repair

## Objective

Repair state.

## Scope

- Active TODO management.

## Non-goals

- Unrelated workflow state.

## Durable records

- None: validator fixture.

## Commit checklist

- [ ] Repair workflow state.
"""
    first_todo_write = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if first_todo_write.returncode != 0 or todo_path.read_text() != first_todo:
        fail("workflow-state writer must create an expected missing active TODO")

    if not todo_obligation_script.is_file() or not os.access(
        todo_obligation_script, os.X_OK
    ):
        fail("deployed TODO obligation registration helper is missing")

    literal_reason_failures = []
    for obligation_id, owner, reason in (
        ("literal-backslash-t", "test-driven-development", r"Windows path C:\tmp is literal."),
        ("literal-backslash-n", "assumption-pruning", r"Windows path C:\new is literal."),
    ):
        literal_reason_hash = subprocess.check_output(
            ["git", "hash-object", "--no-filters", str(todo_path)], text=True
        ).strip()
        literal_reason_register = subprocess.run(
            [
                str(todo_obligation_script),
                "register",
                "--expect",
                literal_reason_hash,
                "workflow-state-repair",
                "--id",
                obligation_id,
                "--owner",
                owner,
                "--policy",
                "none",
                "--no-save-reason",
                reason,
            ],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
            capture_output=True,
            check=False,
        )
        literal_reason_todo = first_todo.replace(
            "## Commit checklist",
            f"""## Persistence obligations

### `{obligation_id}`
- Owner: `{owner}`
- Policy: `none`
- State: `closed`
- No-save reason: {reason}

## Commit checklist""",
        )
        literal_reason_check = subprocess.run(
            [str(todo_obligation_script), "check", "workflow-state-repair"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
            capture_output=True,
            check=False,
        )
        if (
            literal_reason_register.returncode != 0
            or todo_path.read_bytes() != literal_reason_todo.encode()
            or literal_reason_check.returncode != 0
        ):
            literal_reason_failures.append(
                f"{obligation_id}: register={literal_reason_register.returncode}, "
                f"schema={literal_reason_check.returncode}"
            )

        literal_reason_written_hash = subprocess.check_output(
            ["git", "hash-object", "--no-filters", str(todo_path)], text=True
        ).strip()
        literal_reason_restore = subprocess.run(
            [
                str(workflow_state_writer),
                "--expect",
                literal_reason_written_hash,
                str(todo_path),
            ],
            cwd=state_test_repo,
            env=state_test_env,
            input=first_todo,
            text=True,
            capture_output=True,
            check=False,
        )
        if literal_reason_restore.returncode != 0 or todo_path.read_text() != first_todo:
            fail("validator could not restore the TODO after literal reason registration")
    if literal_reason_failures:
        fail(
            "TODO obligation registration must preserve literal backslashes and valid schema: "
            + "; ".join(literal_reason_failures)
        )

    malformed_obligation_sections = {
        "malformed-fields": """### `malformed-fields`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: The review stays in chat.
- Extra: unexpected
""",
        "unknown-owner": """### `unknown-owner`
- Owner: `unknown-workflow`
- Policy: `none`
- State: `closed`
- No-save reason: An unknown owner is invalid.
""",
        "mismatched-policy": """### `mismatched-policy`
- Owner: `security-audit`
- Policy: `conditional`
- State: `open`
- Destination: `.dev/security/coverage.md`
""",
        "duplicate-ids": """### `duplicate-id`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: The first review stays in chat.

### `duplicate-id`
- Owner: `prose-proofreading`
- Policy: `none`
- State: `closed`
- No-save reason: The second edit needs no workflow record.
""",
        "invalid-path": """### `invalid-path`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `open`
- Destination: `.dev/contexts/../escape.md`
""",
        "invalid-closure": """### `invalid-closure`
- Owner: `security-audit`
- Policy: `required`
- State: `closed`
- Destination: `.dev/security/coverage.md`
""",
        "invalid-evidence": """### `invalid-evidence`
- Owner: `security-audit`
- Policy: `required`
- State: `closed`
- Destination: `.dev/security/missing.md`
- Artifact: [missing](../security/missing.md)
""",
    }
    malformed_preflight_failures = []
    for malformed_name, malformed_section in malformed_obligation_sections.items():
        malformed_todo = first_todo.replace(
            "## Commit checklist",
            "## Persistence obligations\n\n"
            + malformed_section
            + "\n## Commit checklist",
        )
        first_todo_hash = subprocess.check_output(
            ["git", "hash-object", "--no-filters", str(todo_path)], text=True
        ).strip()
        malformed_write = subprocess.run(
            [str(workflow_state_writer), "--expect", first_todo_hash, str(todo_path)],
            cwd=state_test_repo,
            env=state_test_env,
            input=malformed_todo,
            text=True,
            capture_output=True,
            check=False,
        )
        if malformed_write.returncode != 0:
            fail(f"validator could not create malformed {malformed_name} fixture")
        malformed_hash = subprocess.check_output(
            ["git", "hash-object", "--no-filters", str(todo_path)], text=True
        ).strip()
        malformed_registration = subprocess.run(
            [
                str(todo_obligation_script),
                "register",
                "--expect",
                malformed_hash,
                "workflow-state-repair",
                "--id",
                f"preflight-{malformed_name}",
                "--owner",
                "evidence-review",
                "--policy",
                "none",
                "--no-save-reason",
                "The new review would remain in chat.",
            ],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
            capture_output=True,
            check=False,
        )
        if malformed_registration.returncode == 0 or todo_path.read_bytes() != malformed_todo.encode():
            malformed_preflight_failures.append(malformed_name)

        malformed_written_hash = subprocess.check_output(
            ["git", "hash-object", "--no-filters", str(todo_path)], text=True
        ).strip()
        malformed_restore = subprocess.run(
            [str(workflow_state_writer), "--expect", malformed_written_hash, str(todo_path)],
            cwd=state_test_repo,
            env=state_test_env,
            input=first_todo,
            text=True,
            capture_output=True,
            check=False,
        )
        if malformed_restore.returncode != 0 or todo_path.read_text() != first_todo:
            fail(f"validator could not restore the TODO after {malformed_name} preflight")

    unrelated_malformed_todo = first_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `close-target`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `open`
- Destination: `.dev/contexts/close-target.md`

### `other-malformed`
- Owner: `unknown-workflow`
- Policy: `none`
- State: `closed`
- No-save reason: This owner is invalid.

## Commit checklist""",
    )
    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    unrelated_malformed_write = subprocess.run(
        [str(workflow_state_writer), "--expect", first_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=unrelated_malformed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if unrelated_malformed_write.returncode != 0:
        fail("validator could not create the unrelated malformed closure fixture")
    unrelated_malformed_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    unrelated_malformed_close = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            unrelated_malformed_hash,
            "workflow-state-repair",
            "--id",
            "close-target",
            "--no-save-reason",
            "No handoff is needed for this session.",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        unrelated_malformed_close.returncode == 0
        or todo_path.read_bytes() != unrelated_malformed_todo.encode()
    ):
        malformed_preflight_failures.append("close-unrelated-malformed")
    unrelated_written_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    unrelated_restore = subprocess.run(
        [str(workflow_state_writer), "--expect", unrelated_written_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if unrelated_restore.returncode != 0 or todo_path.read_text() != first_todo:
        fail("validator could not restore the TODO after unrelated malformed closure")

    valid_open_todo = first_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `existing-open`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `open`
- Destination: `.dev/contexts/existing-open.md`

## Commit checklist""",
    )
    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    valid_open_write = subprocess.run(
        [str(workflow_state_writer), "--expect", first_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=valid_open_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if valid_open_write.returncode != 0:
        fail("validator could not create the valid open-obligation fixture")
    valid_open_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    valid_open_registration = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            valid_open_hash,
            "workflow-state-repair",
            "--id",
            "preflight-valid-open",
            "--owner",
            "evidence-review",
            "--policy",
            "none",
            "--no-save-reason",
            "The review remains in chat.",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    valid_open_registered_todo = valid_open_todo.replace(
        "## Commit checklist",
        """### `preflight-valid-open`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: The review remains in chat.

## Commit checklist""",
    )
    if (
        valid_open_registration.returncode != 0
        or todo_path.read_text() != valid_open_registered_todo
    ):
        malformed_preflight_failures.append("valid-open-rejected")
    valid_open_written_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    valid_open_restore = subprocess.run(
        [str(workflow_state_writer), "--expect", valid_open_written_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if valid_open_restore.returncode != 0 or todo_path.read_text() != first_todo:
        fail("validator could not restore the TODO after valid open registration")
    if malformed_preflight_failures:
        fail(
            "TODO obligation mutation must reject malformed existing sections unchanged: "
            + ", ".join(malformed_preflight_failures)
        )

    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    unsafe_destination_registration = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            first_todo_hash,
            "workflow-state-repair",
            "--id",
            "unsafe-destination",
            "--owner",
            "security-audit",
            "--policy",
            "required",
            "--destination",
            ".dev/security/unsafe).md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if unsafe_destination_registration.returncode == 0 or todo_path.read_text() != first_todo:
        fail("unsafe Markdown destination registration must preserve the active TODO")

    register_obligation = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            first_todo_hash,
            "workflow-state-repair",
            "--id",
            "security-coverage",
            "--owner",
            "security-audit",
            "--policy",
            "required",
            "--destination",
            ".dev/security/coverage.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    registered_todo = first_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `security-coverage`
- Owner: `security-audit`
- Policy: `required`
- State: `open`
- Destination: `.dev/security/coverage.md`

## Commit checklist""",
    )
    if register_obligation.returncode != 0 or todo_path.read_text() != registered_todo:
        fail(
            "TODO obligation registration must create a required/open entry: "
            f"{register_obligation.stderr.strip()}"
        )

    stale_registration = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            first_todo_hash,
            "workflow-state-repair",
            "--id",
            "stale-obligation",
            "--owner",
            "security-audit",
            "--policy",
            "required",
            "--destination",
            ".dev/security/reports/stale.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if stale_registration.returncode == 0 or todo_path.read_text() != registered_todo:
        fail("stale TODO obligation registration must preserve the active TODO")

    registered_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    obligation_lock = Path(f"{todo_path}.lock")
    obligation_lock.mkdir()
    try:
        locked_registration = subprocess.run(
            [
                str(todo_obligation_script),
                "register",
                "--expect",
                registered_todo_hash,
                "workflow-state-repair",
                "--id",
                "locked-obligation",
                "--owner",
                "security-audit",
                "--policy",
                "required",
                "--destination",
                ".dev/security/reports/locked.md",
            ],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
            capture_output=True,
            check=False,
        )
    finally:
        obligation_lock.rmdir()
    if locked_registration.returncode == 0 or todo_path.read_text() != registered_todo:
        fail("locked TODO obligation registration must preserve the active TODO")

    artifact_path = resolved_state / "security/coverage.md"
    artifact_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "missing",
            str(artifact_path),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Security coverage\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if artifact_write.returncode != 0 or not artifact_path.is_file():
        fail("validator could not create the required obligation artifact")

    closed_registered_todo = registered_todo.replace(
        "- State: `open`\n- Destination: `.dev/security/coverage.md`",
        "- State: `closed`\n"
        "- Destination: `.dev/security/coverage.md`\n"
        "- Artifact: [.dev/security/coverage.md](../security/coverage.md)",
    )
    close_obligation = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            registered_todo_hash,
            "workflow-state-repair",
            "--id",
            "security-coverage",
            "--artifact",
            ".dev/security/coverage.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if close_obligation.returncode != 0 or todo_path.read_text() != closed_registered_todo:
        fail(
            "TODO obligation closure must close the canonical entry and link its artifact: "
            f"{close_obligation.stderr.strip()}"
        )

    closed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    stale_close = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            registered_todo_hash,
            "workflow-state-repair",
            "--id",
            "security-coverage",
            "--artifact",
            ".dev/security/coverage.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if stale_close.returncode == 0 or todo_path.read_text() != closed_registered_todo:
        fail("stale TODO obligation closure must preserve the active TODO")

    restore_open_obligation = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            closed_todo_hash,
            str(todo_path),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input=registered_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_open_obligation.returncode != 0:
        fail("validator could not restore the open obligation fixture")
    artifact_path.unlink()
    missing_artifact_close = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            registered_todo_hash,
            "workflow-state-repair",
            "--id",
            "security-coverage",
            "--artifact",
            ".dev/security/coverage.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if missing_artifact_close.returncode == 0 or todo_path.read_text() != registered_todo:
        fail("missing obligation artifacts must preserve the active TODO")

    artifact_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "missing",
            str(artifact_path),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Security coverage\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if artifact_write.returncode != 0:
        fail("validator could not restore the required obligation artifact")

    restore_first_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", registered_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_first_todo.returncode != 0 or todo_path.read_text() != first_todo:
        fail("validator could not restore the active TODO after obligation registration")

    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    conditional_register = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            first_todo_hash,
            "workflow-state-repair",
            "--id",
            "stateless-session",
            "--owner",
            "context-handoff",
            "--policy",
            "conditional",
            "--destination",
            ".dev/contexts/context-handoff.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    conditional_registered_todo = first_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `stateless-session`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `open`
- Destination: `.dev/contexts/context-handoff.md`

## Commit checklist""",
    )
    if (
        conditional_register.returncode != 0
        or todo_path.read_text() != conditional_registered_todo
    ):
        fail(
            "conditional TODO obligation registration must create an open entry: "
            f"{conditional_register.stderr.strip()}"
        )

    conditional_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    no_save_reason = r"Windows path C:\tmp stays session-local."
    conditional_close = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            conditional_todo_hash,
            "workflow-state-repair",
            "--id",
            "stateless-session",
            "--no-save-reason",
            no_save_reason,
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    conditional_closed_todo = conditional_registered_todo.replace(
        "- State: `open`\n- Destination: `.dev/contexts/context-handoff.md`",
        "- State: `closed`\n- No-save reason: " + no_save_reason,
    )
    if (
        conditional_close.returncode != 0
        or todo_path.read_text() != conditional_closed_todo
    ):
        fail(
            "conditional TODO obligation closure must record a concrete no-save reason: "
            f"{conditional_close.stderr.strip()}"
        )

    conditional_closed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    restore_first_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", conditional_closed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_first_todo.returncode != 0 or todo_path.read_text() != first_todo:
        fail("validator could not restore the active TODO after no-save closure")

    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    required_register = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            first_todo_hash,
            "workflow-state-repair",
            "--id",
            "required-no-save",
            "--owner",
            "security-audit",
            "--policy",
            "required",
            "--destination",
            ".dev/security/coverage.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    required_registered_todo = first_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `required-no-save`
- Owner: `security-audit`
- Policy: `required`
- State: `open`
- Destination: `.dev/security/coverage.md`

## Commit checklist""",
    )
    if required_register.returncode != 0 or todo_path.read_text() != required_registered_todo:
        fail(
            "required TODO obligation registration must create an open entry: "
            f"{required_register.stderr.strip()}"
        )

    required_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    required_close = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            required_todo_hash,
            "workflow-state-repair",
            "--id",
            "required-no-save",
            "--no-save-reason",
            "A required artifact is still warranted.",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if required_close.returncode == 0 or todo_path.read_text() != required_registered_todo:
        fail("required obligations must reject no-save closure without changing the TODO")

    required_registered_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    restore_first_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", required_registered_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_first_todo.returncode != 0 or todo_path.read_text() != first_todo:
        fail("validator could not restore the active TODO after required no-save rejection")

    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    invalid_reason_register = subprocess.run(
        [
            str(todo_obligation_script),
            "register",
            "--expect",
            first_todo_hash,
            "workflow-state-repair",
            "--id",
            "invalid-reason",
            "--owner",
            "context-handoff",
            "--policy",
            "conditional",
            "--destination",
            ".dev/contexts/context-handoff.md",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    invalid_reason_todo = first_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `invalid-reason`
- Owner: `context-handoff`
- Policy: `conditional`
- State: `open`
- Destination: `.dev/contexts/context-handoff.md`

## Commit checklist""",
    )
    if invalid_reason_register.returncode != 0 or todo_path.read_text() != invalid_reason_todo:
        fail(
            "invalid-reason TODO obligation registration must create an open entry: "
            f"{invalid_reason_register.stderr.strip()}"
        )

    invalid_reason_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    for invalid_reason in ("   ", "TBD"):
        invalid_reason_close = subprocess.run(
            [
                str(todo_obligation_script),
                "close",
                "--expect",
                invalid_reason_hash,
                "workflow-state-repair",
                "--id",
                "invalid-reason",
                "--no-save-reason",
                invalid_reason,
            ],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
            capture_output=True,
            check=False,
        )
        if invalid_reason_close.returncode == 0 or todo_path.read_text() != invalid_reason_todo:
            fail(
                "blank and placeholder no-save reasons must preserve the open conditional TODO"
            )

    mixed_close = subprocess.run(
        [
            str(todo_obligation_script),
            "close",
            "--expect",
            invalid_reason_hash,
            "workflow-state-repair",
            "--id",
            "invalid-reason",
            "--artifact",
            ".dev/contexts/context-handoff.md",
            "--no-save-reason",
            "A mixed closure is invalid.",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if mixed_close.returncode == 0 or todo_path.read_text() != invalid_reason_todo:
        fail("artifact and no-save closure inputs must be mutually exclusive")

    invalid_reason_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    restore_first_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", invalid_reason_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_first_todo.returncode != 0 or todo_path.read_text() != first_todo:
        fail("validator could not restore the active TODO after invalid no-save inputs")

    context.first_todo = first_todo
    context.todo_path = todo_path
    context.state_test_env = state_test_env
    context.state_test_repo = state_test_repo
    context.state_test_root = state_test_root
    context.state_test_worktree = state_test_worktree
    context.resolved_state = resolved_state
    context.worktree_state = worktree_state
    context.worktree_todo_path = worktree_todo_path
    context.artifact_path = artifact_path
