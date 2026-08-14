#!/usr/bin/env python3

"""Validate repository-wide invariants enforced by CI."""

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

ROOT = Path(__file__).resolve().parents[2]


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def tracked_files() -> list[Path]:
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    )
    return [
        ROOT / name.decode()
        for name in output.split(b"\0")
        if name and (ROOT / name.decode()).is_file()
    ]


def strip_json_comments(text: str) -> str:
    output: list[str] = []
    index = 0
    in_string = False
    escaped = False
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""

        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            index += 1
        elif char == "/" and next_char == "/":
            index += 2
            while index < len(text) and text[index] != "\n":
                index += 1
        elif char == "/" and next_char == "*":
            end = text.find("*/", index + 2)
            if end == -1:
                fail("unterminated block comment in JSONC")
            output.append("\n" * text[index : end + 2].count("\n"))
            index = end + 2
        else:
            output.append(char)
            index += 1
    return "".join(output)


zsh_cache_builder = ROOT / "scripts/build-zsh-init-cache.sh"
if not zsh_cache_builder.is_file():
    fail("zsh initialization cache builder is missing")

with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    fake_home = test_root / "home"
    fake_bin = test_root / "bin"
    fake_cache = test_root / "cache"
    command_log = test_root / "commands.log"
    fake_home.mkdir()
    fake_bin.mkdir()
    zcompdump = fake_home / ".zcompdump"
    zcompdump.write_text("stale completions\n")

    command_outputs = {
        "sheldon": (
            "#!/bin/sh\n"
            'printf \'sheldon %s\\n\' "$*" >>"$COMMAND_LOG"\n'
            'if test "$1" = source; then\n'
            "  printf 'ZSH_CACHE_EVENTS+=(sheldon)\\n'\n"
            "fi\n"
        ),
        "starship": (
            "#!/bin/sh\n"
            'printf \'starship %s\\n\' "$*" >>"$COMMAND_LOG"\n'
            "printf 'ZSH_CACHE_EVENTS+=(starship)\\n'\n"
        ),
        "zoxide": (
            "#!/bin/sh\n"
            'printf \'zoxide %s\\n\' "$*" >>"$COMMAND_LOG"\n'
            "printf 'ZSH_CACHE_EVENTS+=(zoxide)\\n'\n"
        ),
        "atuin": (
            "#!/bin/sh\n"
            'printf \'atuin %s\\n\' "$*" >>"$COMMAND_LOG"\n'
            "printf 'ZSH_CACHE_EVENTS+=(atuin)\\n'\n"
        ),
    }
    for command, script in command_outputs.items():
        executable = fake_bin / command
        executable.write_text(script)
        executable.chmod(0o755)

    cache_env = dict(os.environ)
    cache_env.update(
        HOME=str(fake_home),
        XDG_CACHE_HOME=str(fake_cache),
        PATH=f"{fake_bin}:/usr/bin:/bin",
        COMMAND_LOG=str(command_log),
    )
    cache_result = subprocess.run(
        ["bash", str(zsh_cache_builder)],
        cwd=ROOT,
        env=cache_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if cache_result.returncode != 0:
        fail("zsh initialization cache builder must succeed with installed tools")
    if zcompdump.exists():
        fail("zsh initialization cache refresh must invalidate completion state")

    generated_cache = fake_cache / "zsh/generated-init.zsh"
    if generated_cache.read_text().splitlines() != [
        "ZSH_CACHE_EVENTS+=(sheldon)",
        "ZSH_CACHE_EVENTS+=(starship)",
        "ZSH_CACHE_EVENTS+=(zoxide)",
        "ZSH_CACHE_EVENTS+=(atuin)",
    ]:
        fail("zsh initialization cache must preserve initializer order")
    if command_log.read_text().splitlines() != [
        "sheldon lock",
        "sheldon source",
        "starship init zsh",
        "zoxide init zsh --cmd cd",
        "atuin init zsh",
    ]:
        fail("zsh initialization cache builder invoked unexpected commands")

    generated_cache.write_text("known-good\n")
    failing_initializer = fake_bin / "atuin"
    failing_initializer.write_text(
        "#!/bin/sh\n"
        "printf 'partial-output\\n'\n"
        "exit 9\n"
    )
    failing_initializer.chmod(0o755)
    failed_cache_result = subprocess.run(
        ["bash", str(zsh_cache_builder)],
        cwd=ROOT,
        env=cache_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if failed_cache_result.returncode == 0:
        fail("zsh initialization cache failures must be reported")
    if generated_cache.read_text() != "known-good\n":
        fail("failed zsh initialization must preserve the previous cache")


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    fake_checkout = test_root / "dotfiles"
    fake_scripts = fake_checkout / "scripts"
    fake_lib = fake_scripts / "lib"
    fake_bin = test_root / "bin"
    fake_home = test_root / "home"
    command_log = test_root / "commands.log"
    fake_lib.mkdir(parents=True)
    fake_bin.mkdir()
    fake_home.mkdir()
    (fake_checkout / "mise.toml").write_text("")
    (fake_scripts / "apply.sh").write_text(
        (ROOT / "scripts/apply.sh").read_text()
    )
    (fake_lib / "runtime.sh").write_text(
        (ROOT / "scripts/lib/runtime.sh").read_text()
    )
    (fake_scripts / "build-zsh-init-cache.sh").write_text(
        "#!/bin/sh\n"
        'printf \'zsh-cache\\n\' >>"$COMMAND_LOG"\n'
    )
    chezmoi_stub = fake_bin / "chezmoi"
    chezmoi_stub.write_text(
        "#!/bin/sh\n"
        'if test "${EXPECT_NEW_RELIC_KEY:-}" = 1; then\n'
        '  test "$NEW_RELIC_LICENSE_KEY" = test-new-relic-key || exit 23\n'
        "fi\n"
        'printf \'chezmoi %s\\n\' "$*" >>"$COMMAND_LOG"\n'
    )
    chezmoi_stub.chmod(0o755)
    op_stub = fake_bin / "op"
    op_stub.write_text(
        "#!/bin/sh\n"
        'test "${OP_MUST_NOT_RUN:-}" != 1 || exit 97\n'
        'printf \'op %s\\n\' "$*" >>"$COMMAND_LOG"\n'
        'test "${OP_READ_FAIL:-}" != 1 || exit 98\n'
        "printf 'test-new-relic-key\\n'\n"
    )
    op_stub.chmod(0o755)
    mise_stub = fake_bin / "mise"
    mise_stub.write_text(
        "#!/bin/sh\n"
        'printf \'mise %s\\n\' "$*" >>"$COMMAND_LOG"\n'
    )
    mise_stub.chmod(0o755)
    uname_stub = fake_bin / "uname"
    uname_stub.write_text("#!/bin/sh\nprintf 'Darwin\\n'\n")
    uname_stub.chmod(0o755)

    apply_env = dict(os.environ)
    apply_env.update(
        HOME=str(fake_home),
        PATH=f"{fake_bin}:/usr/bin:/bin",
        DOTFILES_ROOT=str(fake_checkout),
        COMMAND_LOG=str(command_log),
        EXPECT_NEW_RELIC_KEY="1",
    )
    apply_env.pop("CI", None)
    apply_env.pop("NEW_RELIC_LICENSE_KEY", None)
    apply_result = subprocess.run(
        ["bash", str(fake_scripts / "apply.sh")],
        cwd=fake_checkout,
        env=apply_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if apply_result.returncode != 0:
        fail("dotfile apply must refresh the zsh initialization cache")
    expected_apply_commands = [
        "op read op://Personal/j465rncuz4fcf2rc7aogcosypi/credential",
        f"chezmoi init --source {fake_checkout.resolve()}",
        f"chezmoi --source {fake_checkout.resolve()} apply",
        "zsh-cache",
        f"mise -C {fake_checkout.resolve()} bootstrap macos launchd-agents apply --yes",
    ]
    actual_apply_commands = command_log.read_text().splitlines()
    if actual_apply_commands != expected_apply_commands:
        fail(
            "dotfile apply must refresh the zsh cache and managed services: "
            f"{actual_apply_commands}"
        )

    command_log.write_text("")
    existing_key_env = dict(apply_env)
    existing_key_env.update(
        NEW_RELIC_LICENSE_KEY="test-new-relic-key",
        OP_MUST_NOT_RUN="1",
    )
    existing_key_result = subprocess.run(
        ["bash", str(fake_scripts / "apply.sh")],
        cwd=fake_checkout,
        env=existing_key_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if existing_key_result.returncode != 0:
        fail(
            "dotfile apply must preserve an existing New Relic key: "
            f"exit={existing_key_result.returncode} "
            f"stdout={existing_key_result.stdout.strip()!r} "
            f"stderr={existing_key_result.stderr.strip()!r} "
            f"commands={command_log.read_text().splitlines()}"
        )
    if command_log.read_text().splitlines() != expected_apply_commands[1:]:
        fail("dotfile apply must not query 1Password when the key is already set")

    command_log.write_text("")
    failing_op_env = dict(apply_env)
    failing_op_env["OP_READ_FAIL"] = "1"
    failing_op_result = subprocess.run(
        ["bash", str(fake_scripts / "apply.sh")],
        cwd=fake_checkout,
        env=failing_op_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if failing_op_result.returncode == 0:
        fail("dotfile apply must fail when the 1Password key lookup fails")
    if "failed to load the New Relic key from 1Password" not in failing_op_result.stderr:
        fail("dotfile apply must explain a failed 1Password key lookup")

    command_log.write_text("")
    ci_env = dict(apply_env)
    ci_env.pop("EXPECT_NEW_RELIC_KEY")
    ci_env.update(CI="true", OP_MUST_NOT_RUN="1")
    ci_result = subprocess.run(
        ["bash", str(fake_scripts / "apply.sh")],
        cwd=fake_checkout,
        env=ci_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if ci_result.returncode != 0:
        fail("dotfile apply must remain usable without 1Password in CI")
    if command_log.read_text().splitlines() != expected_apply_commands[1:]:
        fail("dotfile apply must not query 1Password in CI")


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    fake_home = test_root / "home"
    fake_bin = test_root / "bin"
    fake_cache = test_root / "cache"
    command_log = test_root / "commands.log"
    fake_home.mkdir()
    fake_bin.mkdir()
    (fake_cache / "zsh").mkdir(parents=True)
    (fake_cache / "zsh/generated-init.zsh").write_text(
        "ZSH_CACHE_EVENTS+=(cached)\n"
    )
    for command in ("mise", "sheldon", "starship", "zoxide", "atuin"):
        executable = fake_bin / command
        executable.write_text(
            "#!/bin/sh\n"
            f'printf \'{command}\\n\' >>"$COMMAND_LOG"\n'
        )
        executable.chmod(0o755)

    zsh_env = dict(os.environ)
    zsh_env.update(
        HOME=str(fake_home),
        XDG_CACHE_HOME=str(fake_cache),
        PATH=f"{fake_bin}:/usr/bin:/bin",
        COMMAND_LOG=str(command_log),
    )
    zsh_result = subprocess.run(
        [
            "zsh",
            "-dfi",
            "-c",
            (
                f'source "{ROOT / "dot_zshrc"}"; '
                '[[ "${ZSH_CACHE_EVENTS[*]}" == cached ]] || exit 41; '
                '(( ${path[(Ie)$HOME/.local/share/mise/shims]} )) || exit 42'
            ),
        ],
        cwd=ROOT,
        env=zsh_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if zsh_result.returncode != 0:
        fail("zsh must load cached initialization with mise shims")
    if command_log.exists():
        fail("cached zsh startup must not execute initialization commands")


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    fake_home = test_root / "home"
    fake_cache = test_root / "cache"
    fake_functions = test_root / "functions"
    command_log = test_root / "compinit.log"
    fake_home.mkdir()
    (fake_cache / "zsh").mkdir(parents=True)
    fake_functions.mkdir()
    init_cache = fake_cache / "zsh/generated-init.zsh"
    init_cache.write_text("")
    zcompdump = fake_home / ".zcompdump"
    zcompdump.write_text("cached completions\n")
    os.utime(init_cache, (1, 1))
    os.utime(zcompdump, (2, 2))
    (fake_functions / "compinit").write_text(
        'printf \'%s\\n\' "$*" >"$COMMAND_LOG"\n'
    )

    compinit_env = dict(os.environ)
    compinit_env.update(
        HOME=str(fake_home),
        XDG_CACHE_HOME=str(fake_cache),
        FPATH=str(fake_functions),
        COMMAND_LOG=str(command_log),
    )
    compinit_result = subprocess.run(
        ["zsh", "-dfi", "-c", f'source "{ROOT / "dot_zshrc"}"'],
        cwd=ROOT,
        env=compinit_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if compinit_result.returncode != 0:
        fail("zsh must initialize completions from a warm dump")
    if command_log.read_text().strip() != "-C":
        fail("zsh must skip completion auditing for a fresh dump")


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    fake_home = test_root / "home"
    fake_bin = test_root / "bin"
    fake_cache = test_root / "cache"
    fake_functions = test_root / "functions"
    command_log = test_root / "commands.log"
    (fake_home / ".config/op").mkdir(parents=True)
    fake_bin.mkdir()
    (fake_cache / "zsh").mkdir(parents=True)
    fake_functions.mkdir()
    (fake_home / ".config/op/plugins.sh").write_text(
        "export OP_PLUGIN_ALIASES_SOURCED=1\n"
        'if [[ "$(uname -r)" != *microsoft* && "$(uname -r)" != *WSL* ]]; then\n'
        '  alias gh="op plugin run -- gh"\n'
        "fi\n"
    )
    (fake_cache / "zsh/generated-init.zsh").write_text("")
    (fake_functions / "compinit").write_text(":\n")
    for command, output in (("tty", "/dev/probed"), ("uname", "Darwin")):
        executable = fake_bin / command
        executable.write_text(
            "#!/bin/sh\n"
            f'printf \'{command}\\n\' >>"$COMMAND_LOG"\n'
            f"printf '%s\\n' '{output}'\n"
        )
        executable.chmod(0o755)

    darwin_env = dict(os.environ)
    darwin_env.update(
        HOME=str(fake_home),
        XDG_CACHE_HOME=str(fake_cache),
        FPATH=str(fake_functions),
        PATH=f"{fake_bin}:/usr/bin:/bin",
        COMMAND_LOG=str(command_log),
    )
    darwin_result = subprocess.run(
        [
            "zsh",
            "-dfi",
            "-c",
            (
                "TTY=/dev/pts/test; OSTYPE=darwin25.0; "
                f'source "{ROOT / "dot_zshrc"}"; '
                '[[ $GPG_TTY == /dev/pts/test && "$(alias gh)" == '
                '"gh=\'op plugin run -- gh\'" ]]'
            ),
        ],
        cwd=ROOT,
        env=darwin_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if darwin_result.returncode != 0:
        fail("Darwin zsh startup must use built-in terminal and 1Password state")
    if command_log.exists():
        fail("Darwin zsh startup must not run tty or uname probes")


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    fake_home = test_root / "home"
    fake_bin = test_root / "bin"
    fake_cache = test_root / "cache"
    fake_functions = test_root / "functions"
    command_log = test_root / "commands.log"
    fake_home.mkdir()
    fake_bin.mkdir()
    (fake_cache / "zsh").mkdir(parents=True)
    fake_functions.mkdir()
    (fake_functions / "compinit").write_text(":\n")
    (fake_cache / "zsh/generated-init.zsh").write_text(
        'if [[ -z "${ATUIN_SESSION:-}" || "${ATUIN_SHLVL:-}" != "$SHLVL" ]]; then\n'
        "  export ATUIN_SESSION=$(atuin uuid)\n"
        "  export ATUIN_SHLVL=$SHLVL\n"
        "fi\n"
    )
    atuin_stub = fake_bin / "atuin"
    atuin_stub.write_text(
        "#!/bin/sh\n"
        'printf \'atuin %s\\n\' "$*" >>"$COMMAND_LOG"\n'
        "printf '00000000000000000000000000000000\\n'\n"
    )
    atuin_stub.chmod(0o755)

    atuin_env = dict(os.environ)
    atuin_env.pop("ATUIN_SESSION", None)
    atuin_env.pop("ATUIN_SHLVL", None)
    atuin_env.update(
        HOME=str(fake_home),
        XDG_CACHE_HOME=str(fake_cache),
        FPATH=str(fake_functions),
        PATH=f"{fake_bin}:/usr/bin:/bin",
        COMMAND_LOG=str(command_log),
    )
    atuin_result = subprocess.run(
        [
            "zsh",
            "-dfi",
            "-c",
            (
                "TTY=/dev/pts/test; OSTYPE=darwin25.0; "
                f'source "{ROOT / "dot_zshrc"}"; '
                'print -r -- "$ATUIN_SESSION:$ATUIN_SHLVL:$SHLVL"'
            ),
        ],
        cwd=ROOT,
        env=atuin_env,
        capture_output=True,
        text=True,
        check=False,
    )
    if atuin_result.returncode != 0:
        fail("zsh must initialize an Atuin shell session")
    session_id, atuin_level, shell_level = atuin_result.stdout.strip().split(":")
    if not re.fullmatch(r"[0-9a-f]{32}", session_id):
        fail("zsh must generate an Atuin-compatible session ID")
    if atuin_level != shell_level:
        fail("Atuin session level must match the current shell")
    if command_log.exists():
        fail("zsh must not spawn Atuin to generate a session ID")


with tempfile.TemporaryDirectory() as temp_dir:
    fake_home = Path(temp_dir) / "home"
    fake_bin = Path(temp_dir) / "bin"
    fake_home.mkdir()
    fake_bin.mkdir()
    codex_stub = fake_bin / "codex"
    codex_stub.write_text("#!/bin/sh\nexit 0\n")
    codex_stub.chmod(0o755)
    herdr_stub = fake_bin / "herdr"
    herdr_stub.write_text(
        "#!/bin/sh\n"
        'test "$1 $2 $3" = "integration install codex" || exit 1\n'
        'test -d "$HOME/.codex" || exit 42\n'
    )
    herdr_stub.chmod(0o755)
    configure_env = dict(os.environ)
    configure_env.update(
        HOME=str(fake_home),
        PATH=f"{fake_bin}:/usr/bin:/bin",
    )
    configure_result = subprocess.run(
        ["bash", str(ROOT / "scripts/configure-herdr.sh")],
        cwd=ROOT,
        env=configure_env,
        check=False,
    )
    if configure_result.returncode != 0:
        fail("Herdr setup must initialize Codex's config directory")

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
        denied_prompt = run_claude_repository_guard(
            repository, "UserPromptSubmit"
        )
        if denied_prompt.returncode != 2:
            fail(f"Claude must reject {description}")
        if "authorized only" not in denied_prompt.stderr:
            fail(f"Claude rejection must explain its repository boundary: {description}")
        if (
            description == "unapproved owner"
            and "repository owner is not authorized" not in denied_prompt.stderr
        ):
            fail("Claude rejection must identify an unauthorized repository owner")

    denied_tool = run_claude_repository_guard(
        denied_repositories["unapproved owner"], "PreToolUse"
    )
    if denied_tool.returncode != 2:
        fail("Claude tools must be blocked in unauthorized repositories")

    denied_prompt_from_allowed_cwd = run_claude_repository_guard(
        denied_repositories["unapproved owner"],
        "UserPromptSubmit",
        process_cwd=allowed_repository,
    )
    if denied_prompt_from_allowed_cwd.returncode != 2:
        fail("Claude repository authorization must reject the hook input cwd")

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
    launcher_hooks = launcher_home / ".claude/hooks"
    launcher_hooks.mkdir(parents=True)
    launcher_guard = launcher_hooks / "authorize-repository.sh"
    launcher_guard.write_bytes(claude_repository_guard.read_bytes())
    launcher_guard.chmod(0o755)
    launcher_bin = test_root / "launcher-bin"
    launcher_bin.mkdir()
    launcher_stub = launcher_bin / "claude"
    launcher_stub.write_text("#!/bin/sh\nexit 0\n")
    launcher_stub.chmod(0o755)
    launcher_env = dict(os.environ)
    launcher_env.update(
        HOME=str(launcher_home),
        PATH=f"{launcher_bin}:/usr/bin:/bin",
        GITHUB_PERSONAL_ACCESS_TOKEN="test-token",
    )
    unauthorized_launch = subprocess.run(
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
    if unauthorized_launch.returncode == 0:
        fail("Claude launcher must reject unauthorized repositories before startup")

    authorized_launch = subprocess.run(
        [
            "zsh",
            "-c",
            f"source {ROOT / 'dot_config/zsh/functions/claude.zsh'}; claude --version",
        ],
        cwd=allowed_repository,
        env=launcher_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if authorized_launch.returncode != 0:
        fail("Claude launcher must start in authorized repositories")


removed_paths = (
    ".chezmoitemplates/ai-voice.md",
    "Brew" + "file",
    "Dnffile",
    "scoop" + "file.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl",
    "run_onchange_install-" + "scoop-packages.ps1.tmpl",
    "run_onchange_setup-" + "msys2.ps1.tmpl",
    "run_onchange_setup-xdg-env.ps1.tmpl",
    "docs/setup-" + "windows.md",
    "scripts/install-linux.sh",
    "dot_config/project-maker",
    "dot_config/zsh/" + "agent-mail.zsh",
    "dot_claude/agents/frontend-designer.md",
    "dot_claude/CLAUDE.md.tmpl",
    "dot_claude/hooks/executable_auto-test.sh",
    "dot_claude/skills/catchup/SKILL.md",
    "dot_codex/AGENTS.md.tmpl",
    "dot_config/opencode/AGENTS.md.tmpl",
    "dot_config/opencode/plugins/claude-rules.ts",
    "dot_kimi-code/AGENTS.md.tmpl",
    "dot_kimi-code/mcp.json",
    "run_onchange_before_install-" + "mcp-agent-mail.sh.tmpl",
    "run_onchange_before_install-" + "mcp-agent-mail.ps1.tmpl",
    "run_onchange_after_configure-" + "agent-mail.sh.tmpl",
    "run_onchange_after_configure-" + "agent-mail.ps1.tmpl",
)
for relative in removed_paths:
    if (ROOT / relative).exists():
        fail(f"removed integration still exists: {relative}")

for required in (
    "install.sh",
    "mise.toml",
    "mise.lock",
    "scripts/lib/runtime.sh",
    "dot_config/nvim/init.lua",
    "dot_config/nvim/lua/core/keymaps.lua",
    "dot_config/nvim/lua/modules/configs/editor/skkeleton.lua",
    "dot_local/bin/executable_op",
    "dot_local/bin/executable_ssh",
    "dot_local/bin/executable_ssh-add",
    "dot_local/bin/executable_yaskkserv2-serve.tmpl",
    "dot_config/mise/conf.d/wsl.toml.tmpl",
):
    if not (ROOT / required).is_file():
        fail(f"required v2 file is missing: {required}")

for todo in (ROOT / ".dev/todo").glob("*.md"):
    if todo.name == "README.md":
        continue
    todo_text = todo.read_text()
    todo_items = re.findall(r"^- \[([ xX])\]", todo_text, re.MULTILINE)
    if re.search(r"^- 状態:.*完了", todo_text, re.MULTILINE) or (
        todo_items and all(item.casefold() == "x" for item in todo_items)
    ):
        fail(f"completed work item must be removed from .dev/todo: {todo.name}")

for required in (".dev/memory/README.md",):
    if not (ROOT / required).is_file():
        fail(f"context and memory boundary file is missing: {required}")

expected_claude_rule_sources = {
    "delivery.md",
    "git.md",
    "operations.md",
    "symlink_coding.md",
    "symlink_workflow-state.md",
    "verification.md",
}
expected_claude_rule_targets = {
    "coding.md",
    "delivery.md",
    "git.md",
    "operations.md",
    "verification.md",
    "workflow-state.md",
}
claude_rule_sources = {
    path.name for path in (ROOT / "dot_claude/rules").glob("*.md")
}
if claude_rule_sources != expected_claude_rule_sources:
    fail(
        "Claude global rule sources differ from the reviewed set: "
        f"expected {sorted(expected_claude_rule_sources)}, "
        f"got {sorted(claude_rule_sources)}"
    )

shared_coding_rule = ROOT / "dot_agents/rules/coding.md"
if not shared_coding_rule.is_file():
    fail("shared coding rule is missing")
shared_coding_rule_text = shared_coding_rule.read_text()
for required_fragment in (
    "smallest correct change",
    "Preserve user-authored and pre-existing changes",
    "Make names and structure explain what the code does",
    "when the code would otherwise look surprising to a future reader",
    "Do not comment merely to\n  explain why ordinary-looking code exists",
    "Handle failures explicitly",
):
    if required_fragment not in shared_coding_rule_text:
        fail("shared coding rule is missing reviewed behavior")

claude_coding_rule_link = ROOT / "dot_claude/rules/symlink_coding.md"
if not claude_coding_rule_link.is_file():
    fail("Claude shared coding rule symlink source is missing")
if claude_coding_rule_link.read_text().strip() != "../../.agents/rules/coding.md":
    fail("Claude coding rule must link to the canonical shared rule")

shared_workflow_state_rule = ROOT / "dot_agents/rules/workflow-state.md"
if not shared_workflow_state_rule.is_file():
    fail("shared workflow-state rule is missing")
shared_workflow_state_text = shared_workflow_state_rule.read_text()
for required_fragment in (
    "current Git worktree",
    "task-relevant",
    "provenance",
    "freshness",
    "Do not create or write",
):
    if required_fragment not in shared_workflow_state_text:
        fail(f"shared workflow-state rule is missing reviewed behavior: {required_fragment}")

claude_workflow_state_link = ROOT / "dot_claude/rules/symlink_workflow-state.md"
if not claude_workflow_state_link.is_file():
    fail("Claude workflow-state rule symlink source is missing")
if (
    claude_workflow_state_link.read_text().strip()
    != "../../.agents/rules/workflow-state.md"
):
    fail("Claude workflow-state rule must link to the canonical shared rule")

required_claude_rule_fragments = {
    "verification.md": (
        "List -> Red -> Green -> Refactor",
        "Never describe an unrun check as passing",
        "current primary sources",
    ),
    "operations.md": (
        "planned local\n  commits",
        "remote writes or publication",
        "Do not invoke\n  Codex, OpenCode, Kimi, Luna, or `git cc`",
    ),
    "git.md": (
        "one cohesive, reviewable, and revertible Green increment",
        "Do not run `git cc` from Claude",
        "`git diff --staged` and `git log --oneline -50`",
    ),
    "delivery.md": (
        "PRD, STD, and implementation",
        "separate\n  review units and separate pull requests",
        "Remote\n  operations still require an explicit request",
    ),
}
for rule_name, required_fragments in required_claude_rule_fragments.items():
    rule_text = (ROOT / "dot_claude/rules" / rule_name).read_text()
    if rule_text.startswith("---\n"):
        fail(f"Claude global rule must remain unconditional: {rule_name}")
    missing_fragments = [
        fragment for fragment in required_fragments if fragment not in rule_text
    ]
    if missing_fragments:
        fail(f"Claude global rule is missing reviewed behavior: {rule_name}")

codex_global_rule = ROOT / "dot_agents/rules/git.md"
if not codex_global_rule.is_file():
    fail("Codex global Git rule is missing")
codex_global_rule_text = codex_global_rule.read_text()
for required_fragment in (
    "must not inspect or modify repositories whose GitHub remote owner is",
    "Use `git cc` for normal local commits",
    "one cohesive, reviewable, and revertible Green",
):
    if required_fragment not in codex_global_rule_text:
        fail("Codex global Git rule is missing reviewed behavior")

codex_delegation_rule = ROOT / "dot_agents/rules/delegation.md"
if not codex_delegation_rule.is_file():
    fail("Codex global delegation rule is missing")
codex_delegation_rule_text = codex_delegation_rule.read_text()
normalized_codex_delegation_rule_text = " ".join(codex_delegation_rule_text.split())
for required_fragment in (
    "Delegate independent, bounded work",
    "Prefer Luna",
    "both of the following are true",
    "independently verifiable and committable features",
    "implemented concurrently in isolated worktrees",
    "`route-large-implementation` owns large implementations",
    "Do not delegate them to `luna_parallelizer`",
    "luna_parallelizer",
    "Serialize overlapping writes",
):
    if required_fragment not in normalized_codex_delegation_rule_text:
        fail("Codex global delegation rule is missing reviewed behavior")

codex_global_rule_template = ROOT / "dot_agents/rules/AGENTS.md.tmpl"
if not codex_global_rule_template.is_file():
    fail("Codex global rule aggregate is missing")
codex_global_rule_template_text = codex_global_rule_template.read_text()
for required_include in (
    '{{ include "dot_agents/rules/coding.md" }}',
    '{{ include "dot_agents/rules/delegation.md" }}',
    '{{ include "dot_agents/rules/git.md" }}',
    '{{ include "dot_agents/rules/workflow-state.md" }}',
):
    if required_include not in codex_global_rule_template_text:
        fail(
            "Codex global rule aggregate must include shared coding and Codex Git rules"
        )
codex_global_rule_aggregate = subprocess.check_output(
    [
        "chezmoi",
        "--source",
        str(ROOT),
        "execute-template",
        "--file",
        str(codex_global_rule_template),
    ],
    text=True,
)
for required_fragment in (
    "Delegate independent, bounded work",
    "Make names and structure explain what the code does",
    "Use `git cc` for normal local commits",
    "current Git worktree",
):
    if required_fragment not in codex_global_rule_aggregate:
        fail("rendered Codex global rule aggregate is missing reviewed behavior")

codex_global_rule_link = ROOT / "dot_codex/symlink_AGENTS.md"
if not codex_global_rule_link.is_file():
    fail("Codex global AGENTS.md symlink source is missing")
if codex_global_rule_link.read_text().strip() != "../.agents/rules/AGENTS.md":
    fail("Codex global AGENTS.md must link to the canonical rule aggregate")

codex_config_modifier = ROOT / "dot_codex/modify_private_config.toml"
if not codex_config_modifier.is_file():
    fail("Codex stable defaults modifier is missing")

codex_runtime_config = """\
approvals_reviewer = "auto_review"
model = "runtime-model"
model_reasoning_effort = "low"
runtime_marker = "preserve-me"

[agents]
max_concurrent_threads_per_session = 2
default_subagent_model = "runtime-subagent"
default_subagent_reasoning_effort = "medium"

[notice]
hide_rate_limit_model_nudge = true

[projects."/tmp/runtime-project"]
trust_level = "trusted"

[tui.model_availability_nux]
"runtime-model" = 4

[features]
hooks = false

[hooks.state."/tmp/hooks.json:session_start:0:0"]
trusted_hash = "sha256:runtime-owned"
"""
codex_modified_result = subprocess.run(
    ["bash", str(codex_config_modifier)],
    cwd=ROOT,
    input=codex_runtime_config,
    text=True,
    capture_output=True,
    check=False,
    env={**os.environ, "NEW_RELIC_LICENSE_KEY": "test-new-relic-license-key"},
)
if codex_modified_result.returncode != 0:
    fail(f"Codex config modifier failed: {codex_modified_result.stderr.strip()}")
codex_modified_config = tomllib.loads(codex_modified_result.stdout)

expected_codex_defaults = {
    "approvals_reviewer": "user",
    "model": "gpt-5.6-sol",
    "model_reasoning_effort": "high",
}
for key, expected_value in expected_codex_defaults.items():
    if codex_modified_config.get(key) != expected_value:
        fail(f"Codex config modifier did not enforce {key}")

expected_agent_defaults = {
    "max_concurrent_threads_per_session": 8,
    "default_subagent_model": "gpt-5.6-luna",
    "default_subagent_reasoning_effort": "max",
}
for key, expected_value in expected_agent_defaults.items():
    if codex_modified_config.get("agents", {}).get(key) != expected_value:
        fail(f"Codex config modifier did not enforce agents.{key}")

if codex_modified_config.get("features", {}).get("hooks") is not True:
    fail("Codex config modifier must enable lifecycle hooks")

codex_luna_parallelizer = ROOT / "dot_codex/agents/luna-parallelizer.toml"
if not codex_luna_parallelizer.is_file():
    fail("Codex Luna parallelizer agent is missing")
codex_luna_parallelizer_config = tomllib.loads(codex_luna_parallelizer.read_text())
normalized_luna_parallelizer_instructions = " ".join(
    codex_luna_parallelizer_config.get("developer_instructions", "").split()
)
expected_luna_parallelizer = {
    "name": "luna_parallelizer",
    "model": "gpt-5.6-luna",
    "model_reasoning_effort": "max",
}
for key, expected_value in expected_luna_parallelizer.items():
    if codex_luna_parallelizer_config.get(key) != expected_value:
        fail(f"Codex Luna parallelizer did not enforce {key}")
for required_fragment in (
    "shallow discovery",
    "disjoint packets",
    "independently verifiable and committable features",
    "implemented concurrently in isolated worktrees",
    "return it to the parent",
    "`route-large-implementation`",
    "spawn subagents",
    "Wait for every worker",
    "verify",
):
    if required_fragment not in normalized_luna_parallelizer_instructions:
        fail("Codex Luna parallelizer is missing reviewed behavior")

luna_parallelizer_flow = (
    "Begin with only enough shallow discovery",
    "Before deep investigation, editing files, or spawning subagents",
    "return it to the parent",
    "spawn subagents concurrently",
)
luna_parallelizer_flow_positions = [
    normalized_luna_parallelizer_instructions.find(fragment)
    for fragment in luna_parallelizer_flow
]
if -1 in luna_parallelizer_flow_positions or luna_parallelizer_flow_positions != sorted(
    luna_parallelizer_flow_positions
):
    fail(
        "Codex Luna parallelizer must discover, classify or return, then fan out"
    )

expected_codex_otel = {
    "environment": "prod",
    "log_user_prompt": False,
    "exporter": {
        "otlp-http": {
            "endpoint": "https://otlp.nr-data.net/v1/logs",
            "protocol": "binary",
            "headers": {"api-key": "test-new-relic-license-key"},
        }
    },
    "trace_exporter": {
        "otlp-http": {
            "endpoint": "https://otlp.nr-data.net/v1/traces",
            "protocol": "binary",
            "headers": {"api-key": "test-new-relic-license-key"},
        }
    },
    "metrics_exporter": {
        "otlp-http": {
            "endpoint": "https://otlp.nr-data.net/v1/metrics",
            "protocol": "binary",
            "headers": {"api-key": "test-new-relic-license-key"},
        }
    },
}
if codex_modified_config.get("otel") != expected_codex_otel:
    fail("Codex config modifier did not configure New Relic OTLP telemetry")

codex_preserved_otel = """\
[otel]
environment = "test"
exporter = "none"
log_user_prompt = false
"""
codex_preserved_otel_env = {
    key: value
    for key, value in os.environ.items()
    if key != "NEW_RELIC_LICENSE_KEY"
}
codex_preserved_otel_result = subprocess.run(
    ["bash", str(codex_config_modifier)],
    cwd=ROOT,
    input=codex_runtime_config + codex_preserved_otel,
    text=True,
    capture_output=True,
    check=False,
    env=codex_preserved_otel_env,
)
if codex_preserved_otel_result.returncode != 0:
    fail(
        "Codex config modifier failed without a New Relic key: "
        f"{codex_preserved_otel_result.stderr.strip()}"
    )
if tomllib.loads(codex_preserved_otel_result.stdout).get("otel") != {
    "environment": "test",
    "exporter": "none",
    "log_user_prompt": False,
}:
    fail("Codex config modifier changed OTLP telemetry without a New Relic key")

preserved_codex_runtime_state = {
    "runtime_marker": "preserve-me",
    "notice": {"hide_rate_limit_model_nudge": True},
    "projects": {"/tmp/runtime-project": {"trust_level": "trusted"}},
    "tui": {"model_availability_nux": {"runtime-model": 4}},
    "hooks": {
        "state": {
            "/tmp/hooks.json:session_start:0:0": {
                "trusted_hash": "sha256:runtime-owned"
            }
        }
    },
}
for key, expected_value in preserved_codex_runtime_state.items():
    if codex_modified_config.get(key) != expected_value:
        fail(f"Codex config modifier changed runtime-owned {key}")

with tempfile.TemporaryDirectory() as temp_dir:
    codex_home = Path(temp_dir) / "home"
    codex_home.mkdir()
    codex_home = codex_home.resolve()
    codex_config = codex_home / ".codex" / "config.toml"
    codex_config.parent.mkdir()
    codex_config.write_text(codex_runtime_config)
    codex_config.chmod(0o600)
    codex_apply_result = subprocess.run(
        [
            "chezmoi",
            "--source",
            str(ROOT),
            "--destination",
            str(codex_home),
            "--persistent-state",
            str(Path(temp_dir) / "chezmoistate.boltdb"),
            "--no-tty",
            "apply",
            ".codex/config.toml",
        ],
        cwd=codex_home,
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, "NEW_RELIC_LICENSE_KEY": "test-new-relic-license-key"},
    )
    if codex_apply_result.returncode != 0:
        fail(f"Codex config apply failed: {codex_apply_result.stderr.strip()}")
    if codex_config.stat().st_mode & 0o777 != 0o600:
        fail("Codex config must remain private after chezmoi apply")

claude_agents = list((ROOT / "dot_claude/agents").glob("*.md"))
if claude_agents:
    fail(f"legacy Claude agents remain: {[path.name for path in claude_agents]}")

expected_agent_skills = {
    "assumption-pruning",
    "context-handoff",
    "execute-worktree-implementation",
    "evidence-review",
    "herdr",
    "peer-consultation",
    "prose-proofreading",
    "route-large-implementation",
    "security-audit",
    "test-driven-development",
    "todo-management",
    "using-workflow-skills",
}

agent_skills_root = ROOT / "dot_agents/skills"
agent_skills = {path.name for path in agent_skills_root.iterdir() if path.is_dir()}
if agent_skills != expected_agent_skills:
    fail(
        "canonical agent skill set differs from the reviewed set: "
        f"expected {sorted(expected_agent_skills)}, got {sorted(agent_skills)}"
    )

combined_skill_description_size = 0
for skill_name in expected_agent_skills:
    skill_file = agent_skills_root / skill_name / "SKILL.md"
    if not skill_file.is_file():
        fail(f"canonical agent skill is missing SKILL.md: {skill_name}")
    skill_text = skill_file.read_text()
    if not skill_text.startswith("---\n"):
        fail(f"agent skill frontmatter is missing: {skill_name}")
    skill_parts = skill_text.split("---\n", 2)
    if len(skill_parts) != 3:
        fail(f"agent skill frontmatter is not closed: {skill_name}")
    skill_frontmatter = skill_parts[1]
    skill_frontmatter_keys = re.findall(
        r"^([A-Za-z0-9_-]+):", skill_frontmatter, re.MULTILINE
    )
    if skill_frontmatter_keys != ["name", "description"]:
        fail(
            "agent skill frontmatter must contain only name and description "
            f"in that order: {skill_name} has {skill_frontmatter_keys}"
        )
    if not re.search(rf"^name: {re.escape(skill_name)}$", skill_text, re.MULTILINE):
        fail(f"agent skill name must match its directory: {skill_name}")
    if not re.search(r"^description:", skill_text, re.MULTILINE):
        fail(f"agent skill description is missing: {skill_name}")
    skill_description = skill_frontmatter.partition("description:")[2].strip()
    if not skill_description:
        fail(f"agent skill description is empty: {skill_name}")
    if len(skill_description) > 1024:
        fail(f"agent skill description exceeds 1024 characters: {skill_name}")
    combined_skill_description_size += len(skill_description)

if combined_skill_description_size > 8000:
    fail(
        "combined agent skill descriptions exceed the Codex discovery budget: "
        f"{combined_skill_description_size} characters"
    )

worktree_openai_prompts = {
    "route-large-implementation": "$route-large-implementation",
    "execute-worktree-implementation": "$execute-worktree-implementation",
}
for worktree_skill_name, prompt_token in worktree_openai_prompts.items():
    worktree_metadata = (
        agent_skills_root / worktree_skill_name / "agents/openai.yaml"
    )
    if not worktree_metadata.is_file():
        fail(f"{worktree_skill_name} must provide agents/openai.yaml")
    if prompt_token not in worktree_metadata.read_text():
        fail(
            f"{worktree_skill_name} default prompt must mention {prompt_token}"
        )

claude_skill_links = {path.name for path in (ROOT / "dot_claude/skills").iterdir()}
expected_claude_skill_links = {
    f"symlink_{skill_name}" for skill_name in expected_agent_skills
}
if claude_skill_links != expected_claude_skill_links:
    fail(
        "Claude skill links differ from the canonical agent skill set: "
        f"expected {sorted(expected_claude_skill_links)}, "
        f"got {sorted(claude_skill_links)}"
    )

for skill_name in expected_agent_skills:
    link_source = ROOT / "dot_claude/skills" / f"symlink_{skill_name}"
    expected_target = f"../../.agents/skills/{skill_name}\n"
    if link_source.read_text() != expected_target:
        fail(f"Claude skill link must target the canonical skill: {skill_name}")

tdd_skill = (agent_skills_root / "test-driven-development/SKILL.md").read_text()
for required_tdd_phrase in (
    "test list",
    "exactly one",
    "expected reason",
    "List → Red → Green → Refactor",
):
    if required_tdd_phrase not in tdd_skill:
        fail(f"TDD skill is missing t-wada workflow evidence: {required_tdd_phrase}")

effect_contracts = {
    "assumption-pruning": ("remove one assumption", "displaced complexity"),
    "context-handoff": ("export mode", "import mode", "provenance"),
    "evidence-review": ("change review", "dependency update", "independent evidence model"),
    "security-audit": ("attack surface", "coverage ledger", "source commit"),
}
for skill_name, required_phrases in effect_contracts.items():
    skill_text = (agent_skills_root / skill_name / "SKILL.md").read_text()
    for required_phrase in required_phrases:
        phrase_pattern = r"\s+".join(re.escape(part) for part in required_phrase.split())
        if not re.search(phrase_pattern, skill_text, re.IGNORECASE):
            fail(f"{skill_name} is missing its effect contract: {required_phrase}")

worktree_effect_contracts = {
    "route-large-implementation": (
        "independent isolated worktree units",
        "both of the following are true",
        "independently verifiable and committable features",
        "implemented concurrently in isolated worktrees",
        "HERDR_ENV=1",
        "$HOME/.local/bin/herdr-worktree",
        "Herdr JSON",
        ".result.workspace",
        ".result.root_pane",
        "exactly one top-level coordinator",
        "--kind codex",
        "--kind claude",
        "WHAT/HOW/DONE",
        "$execute-worktree-implementation",
        "/execute-worktree-implementation",
        "English `/goal`",
        "never recursively invokes itself",
    ),
    "execute-worktree-implementation": (
        "explicitly invokes it",
        "existing isolated worktree",
        "English `/goal`",
        "concrete todo list",
        "behavior-test list",
        "parallel, read-only",
        "fresh client-matched worker",
        "$test-driven-development",
        "/test-driven-development",
        "git cc",
        "git commit -m",
        "never create or choose a worktree",
    ),
}

worktree_skill_texts = {}
for worktree_skill_name, required_phrases in worktree_effect_contracts.items():
    worktree_skill_text = (agent_skills_root / worktree_skill_name / "SKILL.md").read_text()
    worktree_skill_texts[worktree_skill_name] = worktree_skill_text
    for required_phrase in required_phrases:
        phrase_pattern = r"\s+".join(
            re.escape(part) for part in required_phrase.split()
        )
        if not re.search(phrase_pattern, worktree_skill_text, re.IGNORECASE):
            fail(
                f"{worktree_skill_name} is missing its effect contract: "
                f"{required_phrase}"
            )

route_worktree_skill = worktree_skill_texts["route-large-implementation"]
claude_operations_rule = (ROOT / "dot_claude/rules/operations.md").read_text()
if "--kind claude" in route_worktree_skill:
    for required_route_authorization in (
        "Claude outer orchestration requires an explicit user request",
        "same approved Claude account",
        "same authorized repository",
    ):
        authorization_pattern = r"\s+".join(
            re.escape(part) for part in required_route_authorization.split()
        )
        if not re.search(authorization_pattern, route_worktree_skill):
            fail(
                "Claude worktree dispatch is missing its authorization boundary: "
                f"{required_route_authorization}"
            )
    for required_operations_authorization in (
        "same approved Claude account",
        "same authorized repository",
        "isolated worktree sessions and built-in subagents",
    ):
        authorization_pattern = r"\s+".join(
            re.escape(part) for part in required_operations_authorization.split()
        )
        if not re.search(authorization_pattern, claude_operations_rule):
            fail(
                "Claude operations rule does not authorize worktree dispatch: "
                f"{required_operations_authorization}"
            )
    if re.search(r"use only the current\s+Claude session", claude_operations_rule):
        fail("Claude operations rule still forbids authorized worktree dispatch")

execute_worktree_skill = worktree_skill_texts["execute-worktree-implementation"]
delegate_section = execute_worktree_skill.partition("## Plan and delegate")[2].partition(
    "## Dispatch failures"
)[0]
if not delegate_section:
    fail("execute-worktree-implementation is missing its delegation section")
if "/goal" in delegate_section:
    fail("worktree delegates must receive bounded prompts instead of session /goal")
if re.search(r"\bpreload\w*\b", delegate_section, re.IGNORECASE):
    fail("Claude delegates must invoke TDD through the Skill tool without preload")
for required_delegate_behavior in ("bounded ordinary prompt", "Skill tool"):
    if required_delegate_behavior not in delegate_section:
        fail(
            "Claude delegation is missing executable guidance: "
            f"{required_delegate_behavior}"
        )

trust_contracts = {
    "context-handoff": (
        "current worktree",
        "repository-owned",
        "provenance",
        "freshness",
        "another worktree",
    ),
    "evidence-review": (
        "repository-owned",
        "current code",
        "another worktree",
        "legacy",
    ),
    "security-audit": (
        "canonical audit history",
        "not proof of safety",
        "source commit",
        "another worktree",
    ),
}
for evidence_skill_name, required_phrases in trust_contracts.items():
    evidence_skill = (
        agent_skills_root / evidence_skill_name / "SKILL.md"
    ).read_text()
    for required_phrase in required_phrases:
        phrase_pattern = r"\s+".join(re.escape(part) for part in required_phrase.split())
        if not re.search(phrase_pattern, evidence_skill, re.IGNORECASE):
            fail(
                f"{evidence_skill_name} is missing its tiered trust contract: "
                f"{required_phrase}"
            )

context_handoff_contract = (
    agent_skills_root / "context-handoff/SKILL.md"
).read_text()
for required_context_phrase in (
    "content-addressed",
    "Write the handoff last",
    "Never store a known credential",
    "Pin the handoff's own content hash",
    "context-snapshot/v1",
    "raw, uncompressed",
    "Capture the source snapshot before writing managed state",
):
    context_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_context_phrase.split()
    )
    if not re.search(context_phrase_pattern, context_handoff_contract):
        fail(f"context handoff checkpoint contract is incomplete: {required_context_phrase}")

security_audit_contract = (agent_skills_root / "security-audit/SKILL.md").read_text()
for required_security_phrase in (
    "audit run IDs not yet indexed",
    "Never update the ledger first",
    "monotonic publish order",
):
    security_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_security_phrase.split()
    )
    if not re.search(security_phrase_pattern, security_audit_contract):
        fail(f"security audit checkpoint contract is incomplete: {required_security_phrase}")

evidence_review_contract = (agent_skills_root / "evidence-review/SKILL.md").read_text()
for required_review_phrase in (
    "Bind the review and final disposition to this snapshot hash",
    "establish causality",
    "classification explains provenance only",
    "Regeneration or equivalent resolver evidence is required",
    "affected supported target without equivalent current evidence",
    "any unresolved `blocking-defect` yields `changes required`",
):
    review_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_review_phrase.split()
    )
    if not re.search(review_phrase_pattern, evidence_review_contract):
        fail(f"evidence review disposition contract is incomplete: {required_review_phrase}")

workflow_skill = (agent_skills_root / "using-workflow-skills/SKILL.md").read_text()
for required_workflow_phrase in (
    "one canonical owner",
    "User and system instructions take precedence",
    "test-driven-development",
    "evidence-review",
):
    if required_workflow_phrase not in workflow_skill:
        fail(f"workflow routing guardrail is incomplete: {required_workflow_phrase}")

routed_skill_names = re.findall(
    r"^\|[^|]+\| `([^`]+)` \|$", workflow_skill, re.MULTILINE
)
expected_routed_skill_names = expected_agent_skills - {"using-workflow-skills"}
if len(routed_skill_names) != len(set(routed_skill_names)):
    fail(f"workflow routing guardrail has duplicate owners: {routed_skill_names}")
if set(routed_skill_names) != expected_routed_skill_names:
    fail(
        "workflow routing guardrail differs from the canonical skills: "
        f"expected {sorted(expected_routed_skill_names)}, "
        f"got {sorted(routed_skill_names)}"
    )

todo_management_contract = (agent_skills_root / "todo-management/SKILL.md").read_text()
for required_todo_phrase in (
    "explicitly requested the exact TODO",
    "current Git worktree",
    "AGENT_WORKFLOW_STATE_HOME",
    "git hash-object --no-filters",
    "scripts/todo-complete --expect",
):
    if required_todo_phrase not in todo_management_contract:
        fail(f"TODO management contract is incomplete: {required_todo_phrase}")

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

workflow_helper_targets = (
    "context-handoff/scripts/context-candidates",
    "context-handoff/scripts/context-path",
    "todo-management/scripts/todo-complete",
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

workflow_state_reference = (
    agent_skills_root / "using-workflow-skills/references/persistent-state.md"
).read_text()
for required_state_phrase in (
    "Claude automatic memory is disabled",
    "current Git worktree",
    "repository-owned",
    "provenance",
    "freshness",
    "another worktree",
    "livesense-inc",
    "jobtalk",
    "AGENT_WORKFLOW_STATE_HOME",
):
    state_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_state_phrase.split()
    )
    if not re.search(state_phrase_pattern, workflow_state_reference):
        fail(f"workflow-state contract is incomplete: {required_state_phrase}")

if re.search(
    r"every\s+record\s+is\s+(?:\*\*)?untrusted\s+evidence",
    workflow_state_reference,
    re.IGNORECASE,
):
    fail(
        "current-worktree repository-owned workflow state must not be "
        "blanket-distrusted"
    )

agents_instructions = (ROOT / "AGENTS.md").read_text()
if re.search(
    r"saved\s+records\s+remain\s+untrusted\s+evidence",
    agents_instructions,
    re.IGNORECASE,
):
    fail("AGENTS.md must distinguish current-worktree .dev from imported evidence")

state_skill_resolvers = {
    "context-handoff": "scripts/context-path --ensure",
    "security-audit": "workflow-state-root --ensure",
    "todo-management": "scripts/todo-path --ensure",
}
for state_skill_name, expected_resolver in state_skill_resolvers.items():
    state_skill = (agent_skills_root / state_skill_name / "SKILL.md").read_text()
    if expected_resolver not in state_skill:
        fail(f"{state_skill_name} must use its workflow-state resolver")

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

if (ROOT / "dot_claude/hooks/executable_herdr-review-notify.sh").exists():
    fail("legacy Herdr review notification hook remains")

removals = (ROOT / ".chezmoiremove").read_text().splitlines()
for restored_rule_name in expected_claude_rule_targets:
    restored_target = f".claude/rules/{restored_rule_name}"
    if restored_target in removals:
        fail(f"restored Claude rule must not remain in .chezmoiremove: {restored_target}")

if ".codex/AGENTS.md" in removals:
    fail("restored Codex global AGENTS.md must not remain in .chezmoiremove")
if ".config/opencode/AGENTS.md" in removals:
    fail("restored OpenCode global AGENTS.md must not remain in .chezmoiremove")

opencode_global_rule_link = ROOT / "dot_config/opencode/symlink_AGENTS.md"
if not opencode_global_rule_link.is_file():
    fail("OpenCode global AGENTS.md symlink source is missing")
if (
    opencode_global_rule_link.read_text().strip()
    != "../../.agents/rules/workflow-state.md"
):
    fail("OpenCode global AGENTS.md must link to the canonical workflow-state rule")

for restored_skill_name in expected_agent_skills:
    restored_target = f".claude/skills/{restored_skill_name}"
    if restored_target in removals:
        fail(f"restored Claude skill must not remain in .chezmoiremove: {restored_target}")

for target in (
    ".claude/CLAUDE.md",
    ".claude/agents/frontend-designer.md",
    ".claude/hooks/auto-test.sh",
    ".claude/hooks/herdr-review-notify.sh",
    ".claude/rules/development.md",
    ".claude/rules/review.md",
    ".claude/agents/code-reviewer.md",
    ".claude/agents/doc-reviewer.md",
    ".claude/agents/independent-consultant.md",
    ".claude/agents/performance-reviewer.md",
    ".claude/agents/pr-test-analyzer.md",
    ".claude/agents/security-reviewer.md",
    ".claude/agents/silent-failure-hunter.md",
    ".claude/skills/adversarial-review",
    ".claude/skills/catchup",
    ".claude/skills/conversation-context-export",
    ".claude/skills/conversation-context-import",
    ".claude/skills/develop",
    ".claude/skills/library-update-review",
    ".claude/skills/pr-review",
    ".claude/skills/project-memory",
    ".claude/skills/sanity-review",
    ".claude/skills/ship",
    ".claude/skills/subagent-consultation",
    ".config/opencode/plugins/claude-rules.ts",
    ".config/agent-workflows/state-home",
    ".config/project-maker",
    ".config/zsh/" + "agent-mail.zsh",
    ".kimi-code/AGENTS.md",
    ".kimi-code/mcp.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1",
    "Library/LaunchAgents/com.user.yaskkserv2.plist",
    ".config/systemd/user/yaskkserv2.service",
    ".config/mise/.env",
    ".config/mise/.miserc.toml",
    ".config/mise/miserc.toml",
    ".config/zsh/functions/mise.zsh",
):
    if target not in removals:
        fail(f"deleted chezmoi target is missing from .chezmoiremove: {target}")

for path in tracked_files():
    if path in {ROOT / ".chezmoiremove", Path(__file__).resolve()}:
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue

    compact = text.casefold()
    forbidden = (
        "home" + "brew",
        "mcp_" + "agent_mail",
        "mcp-" + "agent-mail",
        "agent" + "-mail",
        "agent" + " mail",
        "scoop",
        "msys2",
    )
    for needle in forbidden:
        if needle in compact:
            fail(f"obsolete integration reference {needle!r} remains in {path.relative_to(ROOT)}")

for path in tracked_files():
    if path.suffix != ".json":
        continue
    try:
        json.loads(path.read_text())
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {error}")

opencode = json.loads((ROOT / "dot_config/opencode/opencode.json").read_text())
if opencode.get("autoupdate") is not False:
    fail("OpenCode self-update must remain disabled; mise owns the pinned version")

opencode_instructions = opencode.get("instructions")
if not isinstance(opencode_instructions, list):
    fail("OpenCode instructions must be a list")
if "AGENTS.md" in opencode_instructions:
    fail("OpenCode must not load AGENTS.md twice")
if ".cursor/rules/*.md" not in opencode_instructions:
    fail("OpenCode must retain project Cursor rule discovery")

opencode_permissions = opencode.get("permission")
if not isinstance(opencode_permissions, dict):
    fail("OpenCode permission must be an object")
opencode_bash = opencode_permissions.get("bash")
if not isinstance(opencode_bash, dict):
    fail("OpenCode permission.bash must be an object")
if opencode_bash.get("*") != "ask":
    fail("OpenCode shell commands must ask by default")
if opencode_bash.get("git *") == "allow":
    fail("OpenCode must not pre-approve the git namespace")

required_opencode_bash = {
    "allow": {
        "git status *",
        "git diff *",
        "git log *",
        "git show *",
        "git rev-parse *",
        "git ls-files *",
        "git add *",
        "git commit *",
    },
    "ask": {
        "git add .",
        "git add -A *",
        "git commit --amend *",
        "git reset *",
        "git clean *",
        "git restore *",
        "git push *",
        "npm publish *",
        "cargo publish *",
        "go install *",
    },
    "deny": {
        "rm -rf *",
        "git push --force *",
        "git push --force-with-lease *",
    },
}
for action, patterns in required_opencode_bash.items():
    invalid = {
        pattern
        for pattern in patterns
        if opencode_bash.get(pattern) != action
    }
    if invalid:
        fail(f"OpenCode permission.bash must set {action}: {sorted(invalid)}")

settings_template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
try:
    settings = json.loads(settings_template.split("{{-", 1)[0])
except json.JSONDecodeError as error:
    fail(f"invalid Claude settings JSON: {error}")

if settings.get("language") != "Japanese":
    fail("Claude language must not encode a voice or tone")

if settings.get("model") != "opus[1m]":
    fail("Claude default model must track the latest Opus release")

if settings.get("autoMemoryEnabled") is not False:
    fail("Claude automatic memory must remain disabled; use explicit workflow state")

enabled_plugins = settings.get("enabledPlugins")
if not isinstance(enabled_plugins, dict):
    fail("Claude enabledPlugins must be an object")
if enabled_plugins.get("datadog@claude-plugins-official") is not True:
    fail("Claude must enable the official Datadog plugin")

hooks = settings.get("hooks")
if not isinstance(hooks, dict):
    fail("Claude settings hooks must be an object")


def hook_commands_for(event_name: str) -> set[str | None]:
    return {
        hook.get("command")
        for group in hooks.get(event_name, [])
        for hook in group.get("hooks", [])
        if isinstance(hook, dict)
    }


repository_guard_command = "~/.claude/hooks/authorize-repository.sh"
for event_name in ("UserPromptSubmit", "PreToolUse"):
    if repository_guard_command not in hook_commands_for(event_name):
        fail(f"Claude repository authorization must guard {event_name}")

hook_commands = {
    hook.get("command")
    for groups in hooks.values()
    for group in groups
    for hook in group.get("hooks", [])
    if isinstance(hook, dict)
}
for command in (
    "~/.claude/hooks/herdr-review-notify.sh success",
    "~/.claude/hooks/herdr-review-notify.sh failure",
):
    if command in hook_commands:
        fail(f"legacy Herdr review hook remains configured: {command}")

permissions = settings.get("permissions")
if not isinstance(permissions, dict):
    fail("Claude settings permissions must be an object")

required_permissions = {
    "allow": {
        "Bash(git add *)",
        "Bash(git commit *)",
    },
    "ask": {
        "Bash(rm *)",
        "Bash(git reset *)",
        "Bash(git push *)",
        "Bash(gh pr create *)",
        "Bash(gh api *)",
    },
    "deny": {
        "Bash(rm -rf *)",
        "Bash(git push --force *)",
        "Read(**/.env)",
        "Edit(**/.env)",
    },
}
for level, required in required_permissions.items():
    configured = permissions.get(level)
    if not isinstance(configured, list):
        fail(f"Claude permissions.{level} must be a list")
    missing = required - set(configured)
    if missing:
        fail(f"Claude permissions.{level} is missing: {sorted(missing)}")

if "Bash(git *)" in permissions["allow"]:
    fail("Claude permissions.allow must not pre-approve the git namespace")

try:
    renovate = json.loads(strip_json_comments((ROOT / "renovate.jsonc").read_text()))
except json.JSONDecodeError as error:
    fail(f"invalid JSONC in renovate.jsonc: {error}")
if renovate.get("minimumReleaseAge") != "1 day":
    fail("Renovate minimumReleaseAge must remain 1 day")
if renovate.get("timezone") != "Asia/Tokyo":
    fail("Renovate timezone must remain Asia/Tokyo")
if renovate.get("schedule") != ["* 0-5 * * *"]:
    fail("Renovate schedule must remain between midnight and 6am")
if renovate.get("automerge") is not True:
    fail("Renovate automerge must remain enabled")
if renovate.get("automergeType") != "pr":
    fail("Renovate automergeType must remain pr")
if renovate.get("automergeStrategy") != "squash":
    fail("Renovate automergeStrategy must remain squash")
if renovate.get("platformAutomerge") is not True:
    fail("Renovate platformAutomerge must remain enabled")
if renovate.get("lockFileMaintenance", {}).get("enabled") is not True:
    fail("Renovate lockFileMaintenance must remain enabled")
if "customManagers" in renovate:
    fail("Renovate must use the standard mise manager, not customManagers")
if renovate.get("customDatasources", {}).get("onepassword-cli") != {
    "defaultRegistryUrlTemplate": "https://mise-versions.jdx.dev/1password-cli",
    "format": "plain",
}:
    fail("Renovate must resolve 1Password CLI through mise's version endpoint")
if not any(
    rule.get("matchManagers") == ["mise"]
    and rule.get("matchPackageNames") == ["1password/cli"]
    and rule.get("overrideDatasource") == "custom.onepassword-cli"
    and rule.get("versioning") == "semver"
    and rule.get("minimumReleaseAge") is None
    and rule.get("enabled") is not False
    for rule in renovate.get("packageRules", [])
):
    fail("Renovate must track stable 1Password CLI releases")

if (ROOT / "scripts/update.sh").exists():
    fail("dependency updates must be owned by Renovate, not scripts/update.sh")
for relative in (
    "AGENTS.md",
    "README.md",
    "docs/ci.md",
    "mise.toml",
    ".github/workflows/ci.yml",
):
    if "mise run update" in (ROOT / relative).read_text():
        fail(f"obsolete mise run update interface remains in {relative}")
if "[tasks.update]" in (ROOT / "mise.toml").read_text():
    fail("obsolete mise update task remains in mise.toml")

keymaps = (ROOT / "dot_config/nvim/lua/core/keymaps.lua").read_text()
for mapping in (
    'map({ "n", "x", "o" }, "m", "h", opts)',
    'map({ "n", "x", "o" }, "n", "j", opts)',
    'map({ "n", "x", "o" }, "e", "k", opts)',
    'map({ "n", "x", "o" }, "i", "l", opts)',
    'map("n", "s", "i", opts)',
    'map("n", "t", "a", opts)',
    'map({ "n", "x" }, "c", "y", opts)',
    'map({ "n", "x" }, "v", "p", opts)',
):
    if mapping not in keymaps:
        fail(f"Colemak mapping changed or disappeared: {mapping}")

skk = (ROOT / "dot_config/nvim/lua/modules/configs/editor/skkeleton.lua").read_text()
for fragment in (
    'sources = { "skk_server" }',
    'skkServerHost = "127.0.0.1"',
    "skkServerPort = 1178",
):
    if fragment not in skk:
        fail(f"SKK configuration changed or disappeared: {fragment}")

ignore = (ROOT / ".chezmoiignore").read_text()
if "microsoft" not in ignore or ".local/bin/op" not in ignore:
    fail("WSL proxy conditional is missing from .chezmoiignore")

wsl_mise = (ROOT / "dot_config/mise/conf.d/wsl.toml.tmpl").read_text()
if "microsoft" not in wsl_mise or 'disable_tools = ["1password-cli"]' not in wsl_mise:
    fail("WSL must disable the native 1Password CLI")
installer = (ROOT / "install.sh").read_text()
if "MISE_DISABLE_TOOLS" not in installer:
    fail("fresh WSL bootstrap must disable the native 1Password CLI")
if '"$MISE_BIN" trust "$REPO_DIR/mise.toml"' not in installer:
    fail("installer must trust the repository mise project root")
for fragment in (
    '[[ "$(uname -s)" == Linux ]] || return 0',
    "[[ -r /proc/sys/kernel/osrelease ]] || return 0",
    "grep -qi microsoft /proc/sys/kernel/osrelease || return 0",
):
    if fragment not in installer:
        fail(f"non-WSL bootstrap must skip WSL mise configuration successfully: {fragment}")
for fragment in (
    "  ensure_linux_elevation\n\n  if command -v curl",
    'sudo -v || die "sudo authorization is required to install system packages."',
    "run_as_root dnf install",
    "run_as_root pacman -Syu",
):
    if fragment not in installer:
        fail(f"Linux bootstrap elevation check is missing: {fragment}")

workflow = (ROOT / ".github/workflows/ci.yml").read_text()
if "--dry-" + "run" in workflow:
    fail("CI must execute bootstrap interfaces instead of previewing them")
for formatted_manifest in ("mise.toml", "mise/config.toml"):
    if f'"$taplo_bin" format --check {formatted_manifest}' not in workflow:
        fail(f"CI must format-check split manifest: {formatted_manifest}")

format_script = (ROOT / "scripts/format.sh").read_text()
pre_commit_script = (ROOT / "scripts/pre-commit.sh").read_text()
for formatted_manifest in ("mise.toml", "mise/config.toml"):
    if not re.search(
        rf'^"\$taplo_bin" format [^\n]*\b{re.escape(formatted_manifest)}\b',
        format_script,
        re.MULTILINE,
    ):
        fail(f"format task must format split manifest: {formatted_manifest}")
    if formatted_manifest not in pre_commit_script:
        fail(f"pre-commit must inspect split manifest: {formatted_manifest}")

static_job = workflow.split("  package-bootstrap:", 1)[0]
zsh_install = "sudo apt-get install --yes zsh"
if zsh_install not in static_job:
    fail("CI static validation must install zsh")
if static_job.index(zsh_install) > static_job.index(
    "python3 scripts/ci/validate-repository.py"
):
    fail("CI static validation must install zsh before running the repository validator")

codex_config_tools_install = "mise install --locked chezmoi yq"
if codex_config_tools_install not in static_job:
    fail("CI static validation must install chezmoi and yq")
if static_job.index(codex_config_tools_install) > static_job.index(
    "python3 scripts/ci/validate-repository.py"
):
    fail("CI static validation must install chezmoi and yq before the repository validator")

mise_scoped_mise_tests = "mise exec -- python3 scripts/ci/test-validate-mise.py"
if mise_scoped_mise_tests not in static_job:
    fail("CI mise tests must run with installed tools on PATH")

for fragment in (
    "bash install.sh",
    "mise run apply",
    "mise run doctor",
    "mise bootstrap --yes",
    "mise bootstrap packages apply --yes",
    "format --check --stdin-filepath mise.lock - < mise.lock",
    "cargo:sheldon",
    "cargo:git-delta",
    "cargo:fd-find",
    "cargo:atuin",
    "npm:pnpm",
    "dotfiles_wait_for_port 127.0.0.1 1178",
    "intel-macos-mise-v1-${{ runner.os }}-${{ runner.arch }}-",
    "~/.local/share/mise",
    "~/.rustup",
    "~/.cargo/registry",
    "~/.cargo/git",
):
    if fragment not in workflow:
        fail(f"CI no longer executes required integration path: {fragment}")

if not re.search(
    r"(?m)^\s+uses: actions/cache@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+$",
    workflow,
):
    fail("actions/cache must use a full commit SHA with an exact semver comment")

if "\tdefaultBranch = trunk" not in (ROOT / "dot_gitconfig.tmpl").read_text():
    fail("new Git repositories must default to trunk")
if "- Default branch is `trunk`." not in (ROOT / "AGENTS.md").read_text():
    fail("repository instructions must identify trunk as the default branch")
for relative in ("README.md", "docs/setup-linux.md", "docs/setup-macos.md"):
    document = (ROOT / relative).read_text()
    if "raw.githubusercontent.com/kqnade/dotfiles/trunk/install.sh" not in document:
        fail(f"{relative} install command must fetch from trunk")

for relative in (
    "scripts/apply.sh",
    "scripts/bootstrap.sh",
    "scripts/build-skk-dictionary.sh",
    "scripts/doctor.sh",
    "scripts/yaskkserv2-serve.sh",
):
    script = (ROOT / relative).read_text()
    if "scripts/lib/runtime.sh" not in script:
        fail(f"{relative} must use the shared bootstrap runtime")
    if 'readonly DOTFILES_ROOT="${HOME}/repos/' in script:
        fail(f"{relative} must not hard-code the checkout path")

git_config_probe = subprocess.run(
    [
        "bash",
        "-c",
        """
set -euo pipefail
source scripts/lib/runtime.sh
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=test.existing \
GIT_CONFIG_VALUE_0=preserved \
  dotfiles_with_safe_git_directory /trusted/checkout env
""",
    ],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
)
git_config_environment = dict(
    line.split("=", 1)
    for line in git_config_probe.stdout.splitlines()
    if "=" in line
)
expected_git_config = {
    "GIT_CONFIG_COUNT": "2",
    "GIT_CONFIG_KEY_0": "test.existing",
    "GIT_CONFIG_VALUE_0": "preserved",
    "GIT_CONFIG_KEY_1": "safe.directory",
    "GIT_CONFIG_VALUE_1": "/trusted/checkout",
}
for key, expected in expected_git_config.items():
    if git_config_environment.get(key) != expected:
        fail(f"checkout-scoped Git config {key} must be {expected!r}")

bootstrap = (ROOT / "scripts/bootstrap.sh").read_text()
if "dotfiles_with_safe_git_directory" not in bootstrap:
    fail("pre-commit generation must trust only the resolved checkout for its Git subprocess")

print(
    "validated removals, JSON, Claude permissions, public CI paths, WSL proxies, "
    "Neovim, Colemak, and SKK"
)
