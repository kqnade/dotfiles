#!/usr/bin/env python3

"""Validate workflow-state and TODO lifecycle invariants."""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import tempfile
from pathlib import Path

from validate_common import ROOT, fail


agent_skills_root = ROOT / "dot_agents/skills"

workflow_state_script = (
    agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-root"
)
if not workflow_state_script.is_file():
    fail("workflow-state resolver executable source must exist")

workflow_state_digest = (
    agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-digest"
)
if not workflow_state_digest.is_file():
    fail("external workflow-state identity digest executable source must exist")

local_dev_ignore = (
    agent_skills_root
    / "using-workflow-skills/scripts/executable_ensure-local-dev-ignore"
)
if not local_dev_ignore.is_file():
    fail("company repository local .dev ignore executable source must exist")

workflow_state_candidates = (
    agent_skills_root
    / "using-workflow-skills/scripts/executable_workflow-state-candidates"
)
if not workflow_state_candidates.is_file():
    fail("workflow-state candidate discovery executable source must exist")

workflow_state_writer = (
    agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-write"
)
if not workflow_state_writer.is_file():
    fail("workflow-state writer executable source must exist")

context_path_script = (
    agent_skills_root / "context-handoff/scripts/executable_context-path"
)
if not context_path_script.is_file():
    fail("context handoff path resolver executable source must exist")

context_candidates_script = (
    agent_skills_root / "context-handoff/scripts/executable_context-candidates"
)
if not context_candidates_script.is_file():
    fail("context handoff candidate discovery executable source must exist")

todo_path_script = agent_skills_root / "todo-management/scripts/executable_todo-path"
if not todo_path_script.is_file():
    fail("TODO management path resolver executable source must exist")

todo_complete_script = (
    agent_skills_root / "todo-management/scripts/executable_todo-complete"
)
if not todo_complete_script.is_file():
    fail("TODO management completion helper executable source must exist")
todo_obligation_script = (
    agent_skills_root / "todo-management/scripts/executable_todo-obligation"
)
if not todo_obligation_script.is_file():
    fail("TODO management obligation helper executable source must exist")

workflow_helper_targets = (
    "context-handoff/scripts/context-candidates",
    "context-handoff/scripts/context-path",
    "todo-management/scripts/todo-complete",
    "todo-management/scripts/todo-obligation",
    "todo-management/scripts/todo-path",
    "using-workflow-skills/scripts/ensure-local-dev-ignore",
    "using-workflow-skills/scripts/workflow-state-candidates",
    "using-workflow-skills/scripts/workflow-state-digest",
    "using-workflow-skills/scripts/workflow-state-root",
    "using-workflow-skills/scripts/workflow-state-write",
)
workflow_test_directory = tempfile.TemporaryDirectory()
workflow_test_root = Path(workflow_test_directory.name)
workflow_test_home = workflow_test_root / "home"
workflow_test_home.mkdir()
workflow_test_home = workflow_test_home.resolve()
(workflow_test_home / ".agents").mkdir()
workflow_apply_result = subprocess.run(
    [
        "chezmoi",
        "--source",
        str(ROOT),
        "--destination",
        str(workflow_test_home),
        "--persistent-state",
        str(workflow_test_root / "chezmoistate.boltdb"),
        "--no-tty",
        "apply",
        ".agents/skills",
    ],
    cwd=workflow_test_home,
    text=True,
    capture_output=True,
    check=False,
)
if workflow_apply_result.returncode != 0:
    fail(
        "workflow helper materialization failed: "
        f"{workflow_apply_result.stderr.strip()}"
    )

deployed_skills_root = workflow_test_home / ".agents/skills"
for helper_target in workflow_helper_targets:
    deployed_helper = deployed_skills_root / helper_target
    if not deployed_helper.is_file() or not os.access(deployed_helper, os.X_OK):
        fail(f"deployed workflow helper must be executable: {helper_target}")

workflow_state_script = (
    deployed_skills_root / "using-workflow-skills/scripts/workflow-state-root"
)
workflow_state_digest = (
    deployed_skills_root / "using-workflow-skills/scripts/workflow-state-digest"
)
local_dev_ignore = (
    deployed_skills_root / "using-workflow-skills/scripts/ensure-local-dev-ignore"
)
workflow_state_candidates = (
    deployed_skills_root / "using-workflow-skills/scripts/workflow-state-candidates"
)
workflow_state_writer = (
    deployed_skills_root / "using-workflow-skills/scripts/workflow-state-write"
)
context_path_script = deployed_skills_root / "context-handoff/scripts/context-path"
context_candidates_script = (
    deployed_skills_root / "context-handoff/scripts/context-candidates"
)
todo_path_script = deployed_skills_root / "todo-management/scripts/todo-path"
todo_complete_script = deployed_skills_root / "todo-management/scripts/todo-complete"
todo_obligation_script = deployed_skills_root / "todo-management/scripts/todo-obligation"

context_path_result = subprocess.run(
    [str(context_path_script), "--task", "workflow-skill-script-permissions"],
    cwd=ROOT,
    text=True,
    capture_output=True,
    check=False,
)
if context_path_result.returncode != 0:
    fail(
        "deployed context-path must execute nested workflow helpers: "
        f"{context_path_result.stderr.strip()}"
    )
context_path_hash = hashlib.sha256(
    b"task:workflow-skill-script-permissions"
).hexdigest()[:12]
expected_context_path = (
    ROOT
    / f".dev/contexts/workflow-skill-script-permissions-{context_path_hash}.md"
).resolve()
if Path(context_path_result.stdout.strip()) != expected_context_path:
    fail("deployed context-path returned an unexpected context location")

state_home_template = ROOT / "dot_config/agent-workflows/state-home.tmpl"
if state_home_template.exists():
    fail("repository .dev is the default; managed external state-home must be removed")

with tempfile.TemporaryDirectory() as temp_dir:
    state_test_physical_root = Path(temp_dir) / "physical"
    state_test_physical_root.mkdir()
    state_test_root = Path(temp_dir) / "logical"
    state_test_root.symlink_to(state_test_physical_root, target_is_directory=True)
    state_test_repo = state_test_root / "repo"
    state_test_xdg = state_test_root / "state"
    state_test_config = state_test_root / "config"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(state_test_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "config",
            "remote.origin.url",
            "ssh://example.invalid/owner/repository.git",
        ],
        check=True,
    )
    state_test_env = dict(os.environ)
    state_test_env["XDG_STATE_HOME"] = str(state_test_xdg)
    state_test_env["XDG_CONFIG_HOME"] = str(state_test_config)
    state_test_env.pop("AGENT_WORKFLOW_STATE_HOME", None)
    ordinary_exclude = state_test_repo / ".git/info/exclude"
    ordinary_exclude_before = ordinary_exclude.read_bytes()

    unresolved_state = Path(
        subprocess.check_output(
            [str(workflow_state_script)], cwd=state_test_repo, env=state_test_env, text=True
        ).strip()
    )
    if unresolved_state != state_test_repo.resolve() / ".dev":
        fail("workflow-state resolver must default to the current worktree's .dev")
    if unresolved_state.exists():
        fail("workflow-state resolver must not write without --ensure")

    resolved_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if not resolved_state.is_dir():
        fail("workflow-state resolver did not create the repository state directory")
    if resolved_state.stat().st_mode & 0o077:
        fail("workflow-state repository directory must not grant group/other access")
    if ordinary_exclude.read_bytes() != ordinary_exclude_before:
        fail("ordinary repositories must not receive a local .dev ignore rule")

    prospective_review = resolved_state / "reviews/unavailable.md"
    prospective_review.parent.mkdir()
    prospective_review_write = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(prospective_review)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Review\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if prospective_review_write.returncode == 0 or prospective_review.exists():
        fail("workflow-state writer must reject prospective .dev/reviews targets")

    state_test_subdir = state_test_repo / "nested" / "directory"
    state_test_subdir.mkdir(parents=True)
    nested_state = subprocess.check_output(
        [str(workflow_state_script)], cwd=state_test_subdir, env=state_test_env, text=True
    ).strip()
    if nested_state != str(resolved_state):
        fail("workflow-state identity must be stable from repository subdirectories")

    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "-c",
            "user.name=validator",
            "-c",
            "user.email=validator@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "initial",
        ],
        check=True,
    )
    state_test_worktree = state_test_root / "worktree"
    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "worktree",
            "add",
            "-q",
            "-b",
            "state-test",
            str(state_test_worktree),
        ],
        check=True,
    )
    worktree_state = subprocess.check_output(
        [str(workflow_state_script)],
        cwd=state_test_worktree,
        env=state_test_env,
        text=True,
    ).strip()
    if worktree_state != str(state_test_worktree.resolve() / ".dev"):
        fail("each linked worktree must resolve its own repository-local .dev")

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

    main_task_context = Path(
        subprocess.check_output(
            [str(context_path_script), "--ensure", "--task", "cross-client-task"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    worktree_task_context = Path(
        subprocess.check_output(
            [str(context_path_script), "--task", "cross-client-task"],
            cwd=state_test_worktree,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if main_task_context == worktree_task_context:
        fail("linked worktrees must not share the same .dev context record")
    if main_task_context.name != worktree_task_context.name:
        fail("explicit task keys must keep the same filename across worktrees")
    if main_task_context.exists() or not main_task_context.parent.is_dir():
        fail("context path resolver must create only the private parent directory")
    if worktree_task_context.parent.exists():
        fail("read-only context resolution must not create another worktree's .dev")

    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=state_test_worktree,
        env=state_test_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    other_worktree_candidates = subprocess.check_output(
        [str(workflow_state_candidates)],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
    )
    if f"other-worktree-dev\t{worktree_state}" not in other_worktree_candidates:
        fail("candidate discovery must expose, but not merge, another worktree's .dev")

    first_context = "# First context\n"
    first_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "missing",
            str(main_task_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_context,
        text=True,
        capture_output=True,
        check=False,
    )
    if first_write.returncode != 0 or main_task_context.read_text() != first_context:
        fail("workflow-state writer must atomically create an expected missing record")
    if main_task_context.stat().st_mode & 0o177:
        fail("workflow-state records must be owner-readable only")

    first_context_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(main_task_context)], text=True
    ).strip()
    conflicting_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "definitely-wrong",
            str(main_task_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Must not replace the record\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if conflicting_write.returncode == 0 or main_task_context.read_text() != first_context:
        fail("workflow-state writer must reject a stale expected hash")

    second_context = "# Reconciled context\n"
    second_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            first_context_hash,
            str(main_task_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input=second_context,
        text=True,
        capture_output=True,
        check=False,
    )
    if second_write.returncode != 0 or main_task_context.read_text() != second_context:
        fail("workflow-state writer must update a record with the current expected hash")

    context_lock = Path(f"{main_task_context}.lock")
    context_lock.mkdir()
    locked_write = subprocess.run(
        [str(workflow_state_writer), str(main_task_context)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Must not bypass the lock\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if locked_write.returncode == 0 or main_task_context.read_text() != second_context:
        fail("workflow-state writer must reject a concurrently locked record")
    context_lock.rmdir()

    repository_metadata = resolved_state / "repository.meta"
    repository_metadata.write_text("repository state only\n")
    metadata_before = repository_metadata.read_text()
    outside_write = subprocess.run(
        [str(workflow_state_writer), str(repository_metadata)],
        cwd=state_test_repo,
        env=state_test_env,
        input="must not write outside record directories\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if outside_write.returncode == 0 or repository_metadata.read_text() != metadata_before:
        fail("workflow-state writer must reject targets outside record directories")

    directory_target = main_task_context.parent / "directory-target.md"
    directory_target.mkdir()
    directory_write = subprocess.run(
        [str(workflow_state_writer), str(directory_target)],
        cwd=state_test_repo,
        env=state_test_env,
        input="must not become a file inside a directory\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if directory_write.returncode == 0 or any(directory_target.iterdir()):
        fail("workflow-state writer must reject a directory as the final target")

    outside_directory = state_test_root / "outside-state"
    outside_directory.mkdir()
    symlink_target = main_task_context.parent / "symlink-target.md"
    symlink_target.symlink_to(outside_directory, target_is_directory=True)
    symlink_write = subprocess.run(
        [str(workflow_state_writer), str(symlink_target)],
        cwd=state_test_repo,
        env=state_test_env,
        input="must not follow a final symlink\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if symlink_write.returncode == 0 or any(outside_directory.iterdir()):
        fail("workflow-state writer must reject a symlink as the final target")

    main_branch_context = subprocess.check_output(
        [str(context_path_script)], cwd=state_test_repo, env=state_test_env, text=True
    ).strip()
    worktree_branch_context = subprocess.check_output(
        [str(context_path_script)],
        cwd=state_test_worktree,
        env=state_test_env,
        text=True,
    ).strip()
    if main_branch_context == worktree_branch_context:
        fail("different full branch refs must not collide in context paths")

    custom_state_home = state_test_root / "custom-state"
    state_test_env["AGENT_WORKFLOW_STATE_HOME"] = str(custom_state_home)
    custom_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if custom_state_home.resolve() not in custom_state.parents:
        fail("AGENT_WORKFLOW_STATE_HOME must override the default state root")
    state_identity_hash = custom_state.name.rsplit("-", 1)[-1]
    if not re.fullmatch(r"[0-9a-f]{64}", state_identity_hash):
        fail("external workflow-state identity must use a stable SHA-256 digest")
    external_metadata = custom_state / "repository.meta"
    if not external_metadata.is_file():
        fail("external workflow-state resolver must create identity metadata")
    if external_metadata.stat().st_mode & 0o177:
        fail("external workflow-state metadata must be owner-readable only")
    external_metadata_text = external_metadata.read_text()
    for metadata_prefix in (
        "schema=1\n",
        "identity-method=remote.origin.url\n",
        "identity-hash=",
        "git-common-hash=",
        "created-at=",
    ):
        if metadata_prefix not in external_metadata_text:
            fail(f"external workflow-state metadata is missing {metadata_prefix!r}")
    if "ssh://example.invalid" in external_metadata_text:
        fail("external workflow-state metadata must not store the raw remote URL")

    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "config",
            "remote.origin.url",
            "ssh://example.invalid/renamed/repository.git",
        ],
        check=True,
    )
    changed_remote_candidates = subprocess.check_output(
        [str(workflow_state_candidates)],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
    )
    changed_remote_candidate_paths = {
        Path(line.split("\t", 1)[1]).resolve()
        for line in changed_remote_candidates.splitlines()
        if "\t" in line
    }
    if custom_state.resolve() not in changed_remote_candidate_paths:
        fail("candidate discovery must find external state after a remote URL change")
    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "config",
            "remote.origin.url",
            "ssh://example.invalid/owner/repository.git",
        ],
        check=True,
    )

    physical_state_home = state_test_root / "physical-state"
    physical_state_home.mkdir()
    linked_state_home = state_test_root / "linked-state"
    linked_state_home.symlink_to(physical_state_home, target_is_directory=True)
    state_test_env["AGENT_WORKFLOW_STATE_HOME"] = str(
        linked_state_home / ".." / linked_state_home.name
    )
    linked_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if physical_state_home.resolve() not in linked_state.parents:
        fail("workflow-state resolver must canonicalize symlinked external roots")
    linked_context = Path(
        subprocess.check_output(
            [str(context_path_script), "--ensure", "--task", "linked-state"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    linked_write = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(linked_context)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Linked state root\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if linked_write.returncode != 0 or not linked_context.is_file():
        fail("workflow-state writer must accept a canonicalized symlink state root")

    state_test_env.pop("AGENT_WORKFLOW_STATE_HOME", None)
    legacy_identity = "remote.origin.url:ssh://example.invalid/owner/repository.git"
    legacy_repository_hash = subprocess.check_output(
        ["git", "hash-object", "--stdin"],
        cwd=state_test_repo,
        input=legacy_identity,
        text=True,
    ).strip()
    legacy_context_hash = subprocess.check_output(
        ["git", "hash-object", "--stdin"],
        cwd=state_test_repo,
        input="task:legacy-task",
        text=True,
    ).strip()
    legacy_context = (
        state_test_xdg
        / "agent-workflows/repos"
        / f"repository-{legacy_repository_hash}"
        / "contexts"
        / f"legacy-task-{legacy_context_hash[:12]}.md"
    )
    legacy_context.parent.mkdir(parents=True)
    legacy_context.write_text("Record schema: context-handoff/v0\n")
    legacy_candidates = subprocess.check_output(
        [str(context_candidates_script), "--task", "legacy-task"],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
    )
    if str(legacy_context) not in legacy_candidates:
        fail("context candidate discovery must find the legacy Git-hash location")

    state_test_env["AGENT_WORKFLOW_STATE_HOME"] = "relative-state"
    relative_state = subprocess.run(
        [str(workflow_state_script)],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if relative_state.returncode == 0:
        fail("workflow-state resolver must reject a relative state root")

    invalid_task = subprocess.run(
        [str(context_path_script), "--task", "Not Lowercase"],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if invalid_task.returncode == 0:
        fail("context handoff task keys must be stable lowercase slugs")

    company_repo = state_test_root / "company-remote"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(company_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(company_repo),
            "config",
            "remote.origin.url",
            "git@github.com:livesense-inc/jobtalk.git",
        ],
        check=True,
    )
    company_env = dict(os.environ)
    company_env.pop("AGENT_WORKFLOW_STATE_HOME", None)
    company_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=company_repo,
            env=company_env,
            text=True,
        ).strip()
    )
    if company_state != company_repo.resolve() / ".dev":
        fail("company repository workflow state must remain in its local .dev")
    company_exclude = company_repo / ".git/info/exclude"
    if company_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("repositories in the livesense-inc namespace must locally ignore .dev")
    company_ignore_check = subprocess.run(
        ["git", "check-ignore", "--quiet", ".dev/contexts"],
        cwd=company_repo,
        check=False,
    )
    if company_ignore_check.returncode != 0:
        fail("company repository local exclude must actually ignore root .dev content")
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=company_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    if company_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("company repository local .dev ignore must be idempotent")

    tracked_company_repo = state_test_root / "company-tracked-dev"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(tracked_company_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(tracked_company_repo),
            "config",
            "remote.origin.url",
            "https://github.com/livesense-inc/jobtalk.git",
        ],
        check=True,
    )
    tracked_dev = tracked_company_repo / ".dev"
    tracked_dev.mkdir()
    (tracked_dev / "tracked.md").write_text("tracked project record\n")
    subprocess.run(
        ["git", "-C", str(tracked_company_repo), "add", "-f", ".dev/tracked.md"],
        check=True,
    )
    tracked_company_result = subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=tracked_company_repo,
        env=company_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if tracked_company_result.returncode == 0:
        fail("local ignore policy must not pretend an already tracked .dev is hidden")
    tracked_company_exclude = tracked_company_repo / ".git/info/exclude"
    if "/.dev/" in tracked_company_exclude.read_text().splitlines():
        fail("tracked .dev failure must not partially update the local exclude")
    if (tracked_dev / "contexts").exists():
        fail("tracked .dev failure must occur before workflow layout mutation")

    path_company_repo = state_test_root / "repos/livesense-inc/jobtalk"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(path_company_repo)], check=True
    )
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=path_company_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    path_company_exclude = path_company_repo / ".git/info/exclude"
    if path_company_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("livesense-inc local namespace fallback must locally ignore .dev")

    jobtalk_org_repo = state_test_root / "jobtalk-org-repository"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(jobtalk_org_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(jobtalk_org_repo),
            "config",
            "remote.origin.url",
            "git@github.com:jobtalk/internal-app.git",
        ],
        check=True,
    )
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=jobtalk_org_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    jobtalk_org_exclude = jobtalk_org_repo / ".git/info/exclude"
    if jobtalk_org_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("repositories in the jobtalk namespace must locally ignore .dev")

    path_jobtalk_repo = state_test_root / "repos/jobtalk/internal-app"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(path_jobtalk_repo)], check=True
    )
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=path_jobtalk_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    path_jobtalk_exclude = path_jobtalk_repo / ".git/info/exclude"
    if path_jobtalk_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("jobtalk local namespace fallback must locally ignore .dev")

    unrelated_jobtalk_repo = state_test_root / "unrelated-jobtalk-repository"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(unrelated_jobtalk_repo)],
        check=True,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(unrelated_jobtalk_repo),
            "config",
            "remote.origin.url",
            "git@github.com:someone-else/jobtalk.git",
        ],
        check=True,
    )
    unrelated_exclude_before = (
        unrelated_jobtalk_repo / ".git/info/exclude"
    ).read_bytes()
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=unrelated_jobtalk_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    if (
        unrelated_jobtalk_repo / ".git/info/exclude"
    ).read_bytes() != unrelated_exclude_before:
        fail("a repository named jobtalk outside the two namespaces must not be ignored")

workflow_test_directory.cleanup()
