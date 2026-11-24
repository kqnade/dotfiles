#!/usr/bin/env python3

"""Validate Claude repository authorization and launcher invariants."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

from client_runtime_fixture import deploy_client_runtime
from validate_common import ROOT, fail, strip_json_comments, tracked_files


herdr_config_template = ROOT / "dot_config/herdr/config.toml.tmpl"
if not herdr_config_template.is_file():
    fail("Herdr config must be templated for WSL remote SSH behavior")
rendered_herdr_config = subprocess.check_output(
    ["chezmoi", "execute-template", "--file", str(herdr_config_template)],
    cwd=ROOT,
    text=True,
)
herdr_managed_ssh_disabled = bool(
    re.search(
        r"^manage_ssh_config\s*=\s*false\s*$",
        rendered_herdr_config,
        re.MULTILINE,
    )
)
running_on_wsl = (
    sys.platform.startswith("linux")
    and "microsoft" in os.uname().release.lower()
)
if running_on_wsl and not herdr_managed_ssh_disabled:
    fail("Herdr must use plain Windows OpenSSH on WSL remote attaches")
if not running_on_wsl and herdr_managed_ssh_disabled:
    fail("Herdr must retain managed SSH config on native platforms")


claude_repository_guard = (
    ROOT / "dot_claude/hooks/executable_authorize-repository.sh"
)


def run_claude_repository_guard(
    repository: Path, event_name: str, process_cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(claude_repository_guard)],
        cwd=process_cwd or repository,
        input=json.dumps(
            {
                "cwd": str(repository),
                "hook_event_name": event_name,
                "prompt": "test",
            }
        ),
        text=True,
        capture_output=True,
        check=False,
    )


def create_test_repository(
    parent: Path, name: str, remote_url: str | None
) -> Path:
    repository = parent / name
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(repository)],
        check=True,
    )
    if remote_url is not None:
        subprocess.run(
            [
                "git",
                "-C",
                str(repository),
                "config",
                "remote.origin.url",
                remote_url,
            ],
            check=True,
        )
    return repository


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    allowed_repository = create_test_repository(
        test_root,
        "allowed-repository",
        "git@github.com:livesense-inc/example.git",
    )
    allowed_prompt = run_claude_repository_guard(
        allowed_repository, "UserPromptSubmit"
    )
    if allowed_prompt.returncode != 0:
        fail("Claude must be available in livesense-inc repositories")

    allowed_prompt_from_other_cwd = run_claude_repository_guard(
        allowed_repository,
        "UserPromptSubmit",
        process_cwd=test_root,
    )
    if allowed_prompt_from_other_cwd.returncode != 0:
        fail("Claude repository authorization must use cwd from the hook input")

    jobtalk_repository = create_test_repository(
        test_root,
        "jobtalk-repository",
        "https://github.com/jobtalk/example.git",
    )
    jobtalk_prompt = run_claude_repository_guard(
        jobtalk_repository, "UserPromptSubmit"
    )
    if jobtalk_prompt.returncode != 0:
        fail("Claude must be available in jobtalk repositories")

    livesense_https_repository = create_test_repository(
        test_root,
        "livesense-https-repository",
        "https://github.com/livesense-inc/example.git",
    )
    livesense_https_prompt = run_claude_repository_guard(
        livesense_https_repository, "UserPromptSubmit"
    )
    if livesense_https_prompt.returncode != 0:
        fail("Claude repository authorization must support GitHub HTTPS remotes")

    jobtalk_ssh_repository = create_test_repository(
        test_root,
        "jobtalk-ssh-repository",
        "git@github.com:jobtalk/example.git",
    )
    jobtalk_ssh_prompt = run_claude_repository_guard(
        jobtalk_ssh_repository, "UserPromptSubmit"
    )
    if jobtalk_ssh_prompt.returncode != 0:
        fail("Claude repository authorization must support GitHub SSH remotes")

    livesense_ssh_url_repository = create_test_repository(
        test_root,
        "livesense-ssh-url-repository",
        "ssh://git@github.com/livesense-inc/example.git",
    )
    livesense_ssh_url_prompt = run_claude_repository_guard(
        livesense_ssh_url_repository, "UserPromptSubmit"
    )
    if livesense_ssh_url_prompt.returncode != 0:
        fail("Claude repository authorization must support GitHub SSH URLs")

    allowed_tool = run_claude_repository_guard(
        allowed_repository, "PreToolUse"
    )
    if allowed_tool.returncode != 0:
        fail("Claude tools must be available in authorized repositories")

    denied_repositories = {
        "unapproved owner": create_test_repository(
            test_root,
            "unapproved-owner",
            "git@github.com:kqnade/dotfiles.git",
        ),
        "misleading repository name": create_test_repository(
            test_root,
            "misleading-name",
            "git@github.com:someone-else/jobtalk.git",
        ),
        "missing origin": create_test_repository(
            test_root,
            "missing-origin",
            None,
        ),
    }
    non_repository = test_root / "not-a-repository"
    non_repository.mkdir()
    denied_repositories["non-Git directory"] = non_repository

    for description, repository in denied_repositories.items():
        opened = run_claude_repository_guard(repository, "UserPromptSubmit")
        if opened.returncode != 0:
            fail(f"Claude must start for {description}")

    for event in ("preToolUse", "beforeSubmitPrompt"):
        cursor_result = subprocess.run(
            ["bash", str(claude_repository_guard)],
            cwd=denied_repositories["unapproved owner"],
            input=json.dumps({
                "hook_event_name": event,
                "cursor_version": "3.0.0",
                "workspace_roots": [str(denied_repositories["unapproved owner"])],
            }),
            text=True, capture_output=True, check=False,
        )
        if cursor_result.returncode != 0:
            fail(f"Claude's repository hook must not block Cursor's {event}")

    for payload in (
        {"hook_event_name": "PreToolUse", "cursor_version": "3.0.0"},
        {"hook_event_name": "preToolUse"},
        {"hook_event_name": "preToolUse", "cursor_version": ""},
        {"hook_event_name": "preToolUse", "cursor_version": True},
    ):
        result = subprocess.run(
            ["bash", str(claude_repository_guard)],
            cwd=denied_repositories["unapproved owner"],
            input=json.dumps({"cwd": str(denied_repositories["unapproved owner"]), **payload}),
            env={**os.environ, "CURSOR_VERSION": "3.0.0", "TERM_PROGRAM": "cursor"},
            text=True, capture_output=True, check=False,
        )
        if result.returncode != 0:
            fail("Claude must start when Cursor metadata does not identify a Cursor hook")

    outside_tool = run_claude_repository_guard(
        denied_repositories["unapproved owner"], "PreToolUse"
    )
    if outside_tool.returncode != 0:
        fail("Claude tools must be available outside company repositories")

    prompt_from_other_cwd = run_claude_repository_guard(
        denied_repositories["unapproved owner"],
        "UserPromptSubmit",
        process_cwd=allowed_repository,
    )
    if prompt_from_other_cwd.returncode != 0:
        fail("Claude must accept a hook whose cwd is outside a company repository")

    missing_cwd_prompt = subprocess.run(
        ["bash", str(claude_repository_guard)],
        cwd=allowed_repository,
        input=json.dumps(
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "test",
            }
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    if missing_cwd_prompt.returncode != 2:
        fail("Claude repository authorization must reject missing hook input cwd")
    if "hook input cwd is missing or invalid" not in missing_cwd_prompt.stderr:
        fail("Claude repository authorization must report an invalid hook cwd")

    malformed_prompt = subprocess.run(
        ["bash", str(claude_repository_guard)],
        cwd=allowed_repository,
        input="not-json",
        text=True,
        capture_output=True,
        check=False,
    )
    if malformed_prompt.returncode != 2:
        fail("Claude repository authorization must reject malformed hook input")

    launcher_home = test_root / "launcher-home"
    deploy_client_runtime(launcher_home, {"claude_work_enabled": True})
    launcher_hooks = launcher_home / ".claude/hooks"
    launcher_hooks.mkdir(parents=True)
    launcher_guard = launcher_hooks / "authorize-repository.sh"
    launcher_guard.write_bytes(claude_repository_guard.read_bytes())
    launcher_guard.chmod(0o755)
    launcher_bin = test_root / "launcher-bin"
    launcher_bin.mkdir()
    launcher_stub = launcher_bin / "claude"
    launcher_stub.write_text(
        "#!/bin/sh\n"
        "printf 'config=%s\\ntoken=%s\\n' "
        '"${CLAUDE_CONFIG_DIR-}" "${GITHUB_PERSONAL_ACCESS_TOKEN-unset}" '
        '>"$HOME/claude-launch.env"\n'
        "exit 0\n"
    )
    launcher_stub.chmod(0o755)
    launcher_env = dict(os.environ)
    launcher_env.update(
        HOME=str(launcher_home),
        PATH=f"{launcher_bin}:/usr/bin:/bin",
        GITHUB_PERSONAL_ACCESS_TOKEN="test-token",
        CLAUDE_CONFIG_DIR=str(launcher_home / "wrong-config"),
    )
    outside_launch = subprocess.run(
        [
            "zsh",
            "-c",
            f"source {ROOT / 'dot_config/zsh/functions/claude.zsh'}; claude --version",
        ],
        cwd=denied_repositories["unapproved owner"],
        env=launcher_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if outside_launch.returncode != 0:
        fail(
            "Claude launcher must start outside company repositories: "
            f"{outside_launch.stderr}"
        )
    outside_record = (launcher_home / "claude-launch.env").read_text().splitlines()
    if f"config={launcher_home / '.claude'}" not in outside_record:
        fail("Claude must keep its managed configuration directory")
    if "token=test-token" not in outside_record:
        fail("Claude must receive the work GitHub token")
