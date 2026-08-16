#!/usr/bin/env python3

"""Validate workflow-state and TODO lifecycle invariants."""

from __future__ import annotations

import re
import os
import subprocess
from pathlib import Path

from validate_common import fail
from validate_workflow_state_fixtures import ValidationContext, build_validation_context
from validate_todo_completion import validate_todo_completion
from validate_todo_obligations import validate_todo_obligations


def main() -> None:
    context = build_validation_context()
    try:
        validate_workflow_state(context)
    finally:
        context.state_test_directory.cleanup()
        context.workflow_test_directory.cleanup()


def validate_workflow_state(context: ValidationContext) -> None:
    validate_todo_obligations(context)
    validate_todo_completion(context)

    context_candidates_script = context.context_candidates_script
    context_path_script = context.context_path_script
    resolved_state = context.resolved_state
    state_test_env = context.state_test_env
    state_test_repo = context.state_test_repo
    state_test_root = context.state_test_root
    state_test_worktree = context.state_test_worktree
    state_test_xdg = context.state_test_xdg
    workflow_state_candidates = context.workflow_state_candidates
    workflow_state_script = context.workflow_state_script
    workflow_state_writer = context.workflow_state_writer
    worktree_state = context.worktree_state

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
    subprocess.run(["git", "init", "-q", "-b", "trunk", str(company_repo)], check=True)
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
    subprocess.run(["git", "init", "-q", "-b", "trunk", str(path_company_repo)], check=True)
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
    subprocess.run(["git", "init", "-q", "-b", "trunk", str(jobtalk_org_repo)], check=True)
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
    subprocess.run(["git", "init", "-q", "-b", "trunk", str(path_jobtalk_repo)], check=True)
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
    subprocess.run(["git", "init", "-q", "-b", "trunk", str(unrelated_jobtalk_repo)], check=True)
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

if __name__ == "__main__":
    main()
