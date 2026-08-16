#!/usr/bin/env python3

"""Shared fixture setup for workflow-state validation."""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

from validate_common import ROOT, fail


class ValidationContext(SimpleNamespace):
    """Mutable shared fixture state for workflow-state validation."""


def build_validation_context() -> ValidationContext:
    """Build and return the shared fixture context."""
    context = ValidationContext()

    agent_skills_root = ROOT / "dot_agents/skills"
    context.agent_skills_root = agent_skills_root

    workflow_state_script = (
        agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-root"
    )
    if not workflow_state_script.is_file():
        fail("workflow-state resolver executable source must exist")
    context.workflow_state_script = workflow_state_script

    workflow_state_digest = (
        agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-digest"
    )
    if not workflow_state_digest.is_file():
        fail("external workflow-state identity digest executable source must exist")
    context.workflow_state_digest = workflow_state_digest

    local_dev_ignore = (
        agent_skills_root / "using-workflow-skills/scripts/executable_ensure-local-dev-ignore"
    )
    if not local_dev_ignore.is_file():
        fail("company repository local .dev ignore executable source must exist")
    context.local_dev_ignore = local_dev_ignore

    workflow_state_candidates = (
        agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-candidates"
    )
    if not workflow_state_candidates.is_file():
        fail("workflow-state candidate discovery executable source must exist")
    context.workflow_state_candidates = workflow_state_candidates

    workflow_state_writer = (
        agent_skills_root / "using-workflow-skills/scripts/executable_workflow-state-write"
    )
    if not workflow_state_writer.is_file():
        fail("workflow-state writer executable source must exist")
    context.workflow_state_writer = workflow_state_writer

    context_path_script = (
        agent_skills_root / "context-handoff/scripts/executable_context-path"
    )
    if not context_path_script.is_file():
        fail("context handoff path resolver executable source must exist")
    context.context_path_script = context_path_script

    context_candidates_script = (
        agent_skills_root / "context-handoff/scripts/executable_context-candidates"
    )
    if not context_candidates_script.is_file():
        fail("context handoff candidate discovery executable source must exist")
    context.context_candidates_script = context_candidates_script

    todo_path_script = agent_skills_root / "todo-management/scripts/executable_todo-path"
    if not todo_path_script.is_file():
        fail("TODO management path resolver executable source must exist")
    context.todo_path_script = todo_path_script

    todo_complete_script = (
        agent_skills_root / "todo-management/scripts/executable_todo-complete"
    )
    if not todo_complete_script.is_file():
        fail("TODO management completion helper executable source must exist")
    context.todo_complete_script = todo_complete_script

    todo_obligation_script = (
        agent_skills_root / "todo-management/scripts/executable_todo-obligation"
    )
    if not todo_obligation_script.is_file():
        fail("TODO management obligation helper executable source must exist")
    context.todo_obligation_script = todo_obligation_script

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
    context.workflow_helper_targets = workflow_helper_targets

    workflow_test_directory = tempfile.TemporaryDirectory()
    context.workflow_test_directory = workflow_test_directory
    workflow_test_root = Path(workflow_test_directory.name)
    context.workflow_test_root = workflow_test_root
    workflow_test_home = workflow_test_root / "home"
    workflow_test_home.mkdir()
    workflow_test_home = workflow_test_home.resolve()
    context.workflow_test_home = workflow_test_home
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
    context.workflow_apply_result = workflow_apply_result
    if workflow_apply_result.returncode != 0:
        fail(
            "workflow helper materialization failed: "
            f"{workflow_apply_result.stderr.strip()}"
        )

    deployed_skills_root = workflow_test_home / ".agents/skills"
    context.deployed_skills_root = deployed_skills_root
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

    context.workflow_state_script = workflow_state_script
    context.workflow_state_digest = workflow_state_digest
    context.local_dev_ignore = local_dev_ignore
    context.workflow_state_candidates = workflow_state_candidates
    context.workflow_state_writer = workflow_state_writer
    context.context_path_script = context_path_script
    context.context_candidates_script = context_candidates_script
    context.todo_path_script = todo_path_script
    context.todo_complete_script = todo_complete_script
    context.todo_obligation_script = todo_obligation_script

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
    context.context_path_hash = context_path_hash
    context.expected_context_path = expected_context_path

    state_home_template = ROOT / "dot_config/agent-workflows/state-home.tmpl"
    if state_home_template.exists():
        fail("repository .dev is the default; managed external state-home must be removed")
    context.state_home_template = state_home_template

    state_test_temp_dir = tempfile.TemporaryDirectory()
    context.state_test_directory = state_test_temp_dir
    temp_dir = state_test_temp_dir.name
    state_test_physical_root = Path(temp_dir) / "physical"
    state_test_physical_root.mkdir()
    state_test_root = Path(temp_dir) / "logical"
    state_test_root.symlink_to(state_test_physical_root, target_is_directory=True)
    context.state_test_physical_root = state_test_physical_root
    context.state_test_root = state_test_root

    state_test_repo = state_test_root / "repo"
    state_test_xdg = state_test_root / "state"
    state_test_config = state_test_root / "config"
    context.state_test_repo = state_test_repo
    context.state_test_xdg = state_test_xdg
    context.state_test_config = state_test_config

    subprocess.run(["git", "init", "-q", "-b", "trunk", str(state_test_repo)], check=True)
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
    context.state_test_env = dict(os.environ)
    state_test_env = context.state_test_env
    state_test_env["XDG_STATE_HOME"] = str(state_test_xdg)
    state_test_env["XDG_CONFIG_HOME"] = str(state_test_config)
    state_test_env.pop("AGENT_WORKFLOW_STATE_HOME", None)

    ordinary_exclude = state_test_repo / ".git/info/exclude"
    ordinary_exclude_before = ordinary_exclude.read_bytes()
    context.ordinary_exclude_before = ordinary_exclude_before

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
    context.resolved_state = resolved_state
    context.prospective_review = prospective_review
    context.prospective_review_write = prospective_review_write

    state_test_subdir = state_test_repo / "nested" / "directory"
    state_test_subdir.mkdir(parents=True)
    nested_state = subprocess.check_output(
        [str(workflow_state_script)], cwd=state_test_subdir, env=state_test_env, text=True
    ).strip()
    if nested_state != str(resolved_state):
        fail("workflow-state identity must be stable from repository subdirectories")
    context.nested_state = nested_state

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
    context.state_test_worktree = state_test_worktree
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
    context.worktree_state = worktree_state

    return context
