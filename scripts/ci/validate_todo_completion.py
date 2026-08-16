#!/usr/bin/env python3

"""Validate TODO completion behavior for workflow-state."""

from __future__ import annotations

import subprocess

from validate_common import fail

from validate_workflow_state_fixtures import ValidationContext


def validate_todo_completion(context: ValidationContext) -> None:
    artifact_path = context.artifact_path
    first_todo = context.first_todo
    resolved_state = context.resolved_state
    state_test_env = context.state_test_env
    state_test_repo = context.state_test_repo
    todo_complete_script = context.todo_complete_script
    todo_path = context.todo_path
    workflow_state_writer = context.workflow_state_writer

    unprotected_todo_write = subprocess.run(
        [str(workflow_state_writer), str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Must not overwrite an active TODO without CAS\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if unprotected_todo_write.returncode == 0 or todo_path.read_text() != first_todo:
        fail("workflow-state writer must require --expect for active TODO writes")

    first_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    second_todo = first_todo.replace("Repair state.", "Repair repository state.")
    second_todo_write = subprocess.run(
        [str(workflow_state_writer), "--expect", first_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=second_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if second_todo_write.returncode != 0 or todo_path.read_text() != second_todo:
        fail("workflow-state writer must update an active TODO with its current hash")

    second_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    incomplete_todo_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            second_todo_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        incomplete_todo_completion.returncode == 0
        or "unchecked checklist items" not in incomplete_todo_completion.stderr
        or todo_path.read_text() != second_todo
    ):
        fail("TODO completion must preserve an item with an unchecked checklist")

    missing_record_todo = second_todo.replace(
        "- None: validator fixture.",
        "- [Missing context](../contexts/missing-context.md)",
    ).replace("- [ ] Repair workflow state.", "- [x] Repair workflow state.")
    missing_record_write = subprocess.run(
        [str(workflow_state_writer), "--expect", second_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=missing_record_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if missing_record_write.returncode != 0:
        fail("validator could not prepare an active TODO with a missing durable record")
    missing_record_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    missing_record_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            missing_record_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        missing_record_completion.returncode == 0
        or "durable record does not exist" not in missing_record_completion.stderr
        or todo_path.read_text() != missing_record_todo
    ):
        fail("TODO completion must preserve an item with a missing durable record")

    completed_todo = missing_record_todo.replace(
        "- [Missing context](../contexts/missing-context.md)",
        "- None: validator fixture has no durable decisions or evidence.",
    )
    completed_todo_write = subprocess.run(
        [str(workflow_state_writer), "--expect", missing_record_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed_todo_write.returncode != 0:
        fail("validator could not prepare a completed active TODO")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()

    empty_label_todo = completed_todo.replace(
        "- [x] Repair workflow state.",
        "- [x] Repair workflow state.\n- [ ]",
    )
    empty_label_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=empty_label_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if empty_label_write.returncode != 0:
        fail("validator could not prepare an empty-label unchecked TODO item")
    empty_label_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    empty_label_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            empty_label_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        empty_label_completion.returncode == 0
        or "unchecked checklist items" not in empty_label_completion.stderr
        or not todo_path.is_file()
        or todo_path.read_text() != empty_label_todo
    ):
        fail("TODO completion must preserve an empty-label unchecked item")

    nested_unchecked_todo = completed_todo.replace(
        "- [x] Repair workflow state.",
        "- [x] Repair workflow state.\n  - [ ] Nested verification.",
    )
    nested_unchecked_write = subprocess.run(
        [str(workflow_state_writer), "--expect", empty_label_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=nested_unchecked_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if nested_unchecked_write.returncode != 0:
        fail("validator could not prepare a nested unchecked TODO item")
    nested_unchecked_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    nested_unchecked_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            nested_unchecked_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        nested_unchecked_completion.returncode == 0
        or "unchecked checklist items" not in nested_unchecked_completion.stderr
        or not todo_path.is_file()
        or todo_path.read_text() != nested_unchecked_todo
    ):
        fail("TODO completion must preserve a nested unchecked item")

    star_unchecked_todo = completed_todo.replace(
        "- [x] Repair workflow state.",
        "- [x] Repair workflow state.\n* [ ] Unfinished verification.",
    )
    star_unchecked_write = subprocess.run(
        [str(workflow_state_writer), "--expect", nested_unchecked_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=star_unchecked_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if star_unchecked_write.returncode != 0:
        fail("validator could not prepare a star-bullet unchecked TODO item")
    star_unchecked_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    star_unchecked_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            star_unchecked_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        star_unchecked_completion.returncode == 0
        or "unchecked checklist items" not in star_unchecked_completion.stderr
        or not todo_path.is_file()
        or todo_path.read_text() != star_unchecked_todo
    ):
        fail("TODO completion must preserve a star-bullet unchecked item")

    plus_unchecked_todo = completed_todo.replace(
        "- [x] Repair workflow state.",
        "- [x] Repair workflow state.\n+ [ ] Unfinished verification.",
    )
    plus_unchecked_write = subprocess.run(
        [str(workflow_state_writer), "--expect", star_unchecked_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=plus_unchecked_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if plus_unchecked_write.returncode != 0:
        fail("validator could not prepare a plus-bullet unchecked TODO item")
    plus_unchecked_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    plus_unchecked_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            plus_unchecked_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        plus_unchecked_completion.returncode == 0
        or "unchecked checklist items" not in plus_unchecked_completion.stderr
        or not todo_path.is_file()
        or todo_path.read_text() != plus_unchecked_todo
    ):
        fail("TODO completion must preserve a plus-bullet unchecked item")

    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", plus_unchecked_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO fixture")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()

    whitespace_none_todo = completed_todo.replace(
        "- None: validator fixture has no durable decisions or evidence.",
        "- None:" + "   ",
    )
    whitespace_none_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=whitespace_none_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if whitespace_none_write.returncode != 0:
        fail("validator could not prepare an active TODO with a blank None reason")
    whitespace_none_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    whitespace_none_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            whitespace_none_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        whitespace_none_completion.returncode == 0
        or "None reason must contain non-whitespace text"
        not in whitespace_none_completion.stderr
        or not todo_path.is_file()
        or todo_path.read_text() != whitespace_none_todo
    ):
        fail("TODO completion must preserve an item with a blank None reason")

    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", whitespace_none_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO fixture")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    heading_only_todo = completed_todo.replace(
        "## Commit checklist",
        "## Persistence obligations\n\n## Commit checklist",
    )
    heading_only_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=heading_only_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if heading_only_write.returncode != 0:
        fail("validator could not prepare a heading-only persistence section")
    heading_only_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    heading_only_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            heading_only_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if heading_only_completion.returncode != 0 or todo_path.exists():
        fail("TODO completion must allow a heading-only persistence section")
    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO after heading-only gating")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    open_obligation_todo = completed_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `open-obligation`
- Owner: `security-audit`
- Policy: `required`
- State: `open`
- Destination: `.dev/security/open.md`

## Commit checklist""",
    )
    open_obligation_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=open_obligation_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if open_obligation_write.returncode != 0:
        fail("validator could not prepare an active TODO with an open obligation")
    open_obligation_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    open_obligation_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            open_obligation_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if open_obligation_completion.returncode == 0 or not todo_path.is_file():
        fail(
            "TODO completion must preserve an active TODO with an open persistence obligation"
        )
    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", open_obligation_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO after obligation gating")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    closed_obligations_todo = completed_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `closed-artifact`
- Owner: `security-audit`
- Policy: `required`
- State: `closed`
- Destination: `.dev/security/coverage.md`
- Artifact: [coverage evidence](../security/coverage.md)

### `closed-no-save`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: Validator fixture has no durable review artifact.

## Commit checklist""",
    )
    closed_obligations_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=closed_obligations_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if closed_obligations_write.returncode != 0:
        fail("validator could not prepare closed artifact and no-save obligations")
    closed_obligations_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    closed_obligations_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            closed_obligations_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if closed_obligations_completion.returncode != 0 or todo_path.exists():
        fail("TODO completion must accept valid closed artifact and no-save obligations")
    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO after closed obligations")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()

    closed_artifact_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=closed_obligations_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if closed_artifact_write.returncode != 0:
        fail("validator could not prepare the closed artifact revalidation fixture")
    closed_artifact_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    artifact_path.unlink()
    missing_closed_artifact_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            closed_artifact_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        missing_closed_artifact_completion.returncode == 0
        or not todo_path.is_file()
        or todo_path.read_text() != closed_obligations_todo
    ):
        fail("TODO completion must preserve closed obligations when an artifact is removed")
    artifact_write = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(artifact_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Security coverage\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if artifact_write.returncode != 0:
        fail("validator could not restore the closed obligation artifact")
    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", closed_artifact_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO after artifact revalidation")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()

    malformed_obligation_todo = completed_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `malformed-obligation`
- Owner: `security-audit`
- State: `closed`
- Policy: `required`
- Destination: `.dev/security/coverage.md`
- Artifact: [coverage evidence](../security/coverage.md)

## Commit checklist""",
    )
    malformed_obligation_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=malformed_obligation_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if malformed_obligation_write.returncode != 0:
        fail("validator could not prepare a malformed obligation fixture")
    malformed_obligation_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    malformed_obligation_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            malformed_obligation_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        malformed_obligation_completion.returncode == 0
        or not todo_path.is_file()
        or todo_path.read_text() != malformed_obligation_todo
    ):
        fail("TODO completion must preserve a malformed persistence obligation")
    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", malformed_obligation_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO after malformed obligation")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()

    duplicate_obligation_todo = completed_todo.replace(
        "## Commit checklist",
        """## Persistence obligations

### `duplicate-obligation`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: Validator fixture has no durable review artifact.

### `duplicate-obligation`
- Owner: `evidence-review`
- Policy: `none`
- State: `closed`
- No-save reason: Validator fixture has no durable review artifact.

## Commit checklist""",
    )
    duplicate_obligation_write = subprocess.run(
        [str(workflow_state_writer), "--expect", completed_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=duplicate_obligation_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if duplicate_obligation_write.returncode != 0:
        fail("validator could not prepare a duplicate obligation fixture")
    duplicate_obligation_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    duplicate_obligation_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            duplicate_obligation_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        duplicate_obligation_completion.returncode == 0
        or not todo_path.is_file()
        or todo_path.read_text() != duplicate_obligation_todo
    ):
        fail("TODO completion must preserve duplicate persistence obligation IDs")
    restore_completed_todo = subprocess.run(
        [str(workflow_state_writer), "--expect", duplicate_obligation_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if restore_completed_todo.returncode != 0:
        fail("validator could not restore the completed active TODO after duplicate obligation")
    completed_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    completed_todo_result = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            completed_todo_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed_todo_result.returncode != 0 or todo_path.exists():
        fail("TODO completion must delete an eligible item with its current hash")

    stale_todo_write = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=completed_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if stale_todo_write.returncode != 0:
        fail("validator could not recreate an active TODO for conflict testing")
    stale_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    concurrently_updated_todo = completed_todo.replace(
        "validator fixture has no durable decisions or evidence.",
        "updated validator fixture has no durable decisions or evidence.",
    )
    concurrent_todo_write = subprocess.run(
        [str(workflow_state_writer), "--expect", stale_todo_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=concurrently_updated_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if concurrent_todo_write.returncode != 0:
        fail("validator could not prepare a concurrent active TODO update")
    stale_todo_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            stale_todo_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        stale_todo_completion.returncode == 0
        or "active TODO changed" not in stale_todo_completion.stderr
        or todo_path.read_text() != concurrently_updated_todo
    ):
        fail("TODO completion must preserve a concurrently updated item")

    concurrent_todo_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    outside_record_todo = concurrently_updated_todo.replace(
        "- None: updated validator fixture has no durable decisions or evidence.",
        "- [Repository README](../../README.md)",
    )
    outside_record_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            concurrent_todo_hash,
            str(todo_path),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input=outside_record_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if outside_record_write.returncode != 0:
        fail("validator could not prepare an active TODO with an outside record")
    outside_record_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    outside_record_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            outside_record_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if (
        outside_record_completion.returncode == 0
        or "outside an owned .dev area" not in outside_record_completion.stderr
        or todo_path.read_text() != outside_record_todo
    ):
        fail("TODO completion must preserve an item with an outside durable record")

    durable_context = resolved_state / "contexts/todo-completion.md"
    durable_context_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "missing",
            str(durable_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Durable completion evidence\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if durable_context_write.returncode != 0:
        fail("validator could not create durable TODO completion evidence")
    linked_record_todo = outside_record_todo.replace(
        "- [Repository README](../../README.md)",
        "- [Completion evidence](../contexts/todo-completion.md)",
    )
    linked_record_write = subprocess.run(
        [str(workflow_state_writer), "--expect", outside_record_hash, str(todo_path)],
        cwd=state_test_repo,
        env=state_test_env,
        input=linked_record_todo,
        text=True,
        capture_output=True,
        check=False,
    )
    if linked_record_write.returncode != 0:
        fail("validator could not prepare an active TODO with durable evidence")
    linked_record_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(todo_path)], text=True
    ).strip()
    linked_record_completion = subprocess.run(
        [
            str(todo_complete_script),
            "--expect",
            linked_record_hash,
            "workflow-state-repair",
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if linked_record_completion.returncode != 0 or todo_path.exists():
        fail("TODO completion must accept existing owned durable records")

    durable_context_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(durable_context)], text=True
    ).strip()
    forbidden_context_delete = subprocess.run(
        [
            str(workflow_state_writer),
            "--delete",
            "--expect",
            durable_context_hash,
            str(durable_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if forbidden_context_delete.returncode == 0 or not durable_context.is_file():
        fail("workflow-state writer must restrict deletion to active TODOs")
