#!/usr/bin/env python3

"""Validate shell, dotfile-apply, startup, and Herdr integration invariants."""

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
    deploy_client_runtime(fake_home)
    (fake_scripts / "remove-retired-agent-services.sh").write_text(
        '#!/bin/sh\nprintf "retire-services\\n" >>"$COMMAND_LOG"\n'
    )
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
    (fake_scripts / "build-skk-dictionary.sh").write_text(
        "#!/bin/sh\n"
        'printf \'skk-dictionary\\n\' >>"$COMMAND_LOG"\n'
    )
    chezmoi_stub = fake_bin / "chezmoi"
    chezmoi_stub.write_text(
        "#!/bin/sh\n"
        'printf \'chezmoi %s\\n\' "$*" >>"$COMMAND_LOG"\n'
    )
    chezmoi_stub.chmod(0o755)
    op_stub = fake_bin / "op"
    op_stub.write_text(
        "#!/bin/sh\n"
        'printf \'op %s\\n\' "$*" >>"$COMMAND_LOG"\n'
        'exit 97\n'
    )
    op_stub.chmod(0o755)
    mise_stub = fake_bin / "mise"
    mise_stub.write_text(
        "#!/bin/sh\n"
        'printf \'mise %s\\n\' "$*" >>"$COMMAND_LOG"\n'
        'if test "$3" = reshim; then exit "${RESHIM_STATUS:-0}"; fi\n'
        'if test "$5" = install; then exit "${INSTALL_STATUS:-0}"; fi\n'
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
    )
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
    if "systemd user manager" in apply_result.stderr:
        fail("macOS apply must not report a missing systemd user manager")
    expected_apply_commands = [
        f"chezmoi init --source {fake_checkout.resolve()}",
        f"chezmoi --source {fake_checkout.resolve()} apply",
        f"mise -C {fake_checkout.resolve()} reshim",
        "retire-services",
        "zsh-cache",
        "skk-dictionary",
        f"mise -C {fake_checkout.resolve()} bootstrap macos launchd-agents apply --yes",
    ]
    actual_apply_commands = command_log.read_text().splitlines()
    if actual_apply_commands != expected_apply_commands:
        fail(
            "dotfile apply must refresh the zsh cache and managed services: "
            f"{actual_apply_commands}"
        )

    command_log.write_text("")
    failed_reshim = subprocess.run(
        ["bash", str(fake_scripts / "apply.sh")], cwd=fake_checkout,
        env={**apply_env, "RESHIM_STATUS": "17"}, capture_output=True, text=True,
    )
    if failed_reshim.returncode != 17:
        fail("dotfile apply must propagate shim refresh failures")
    if command_log.read_text().splitlines() != expected_apply_commands[:3]:
        fail("shim refresh failures must stop cache rebuilding and service application")

    deploy_client_runtime(fake_home, {"claude_work_enabled": True})
    expected_work_commands = expected_apply_commands[:3] + [
        f"mise trust {fake_checkout.resolve()}/mise.work.toml",
        f"mise -C {fake_checkout.resolve()} -E work install --locked claude",
    ] + expected_apply_commands[3:]
    for status in (0, 19):
        command_log.write_text("")
        result = subprocess.run(
            ["bash", str(fake_scripts / "apply.sh")], cwd=fake_checkout,
            env={**apply_env, "INSTALL_STATUS": str(status)}, capture_output=True, text=True,
        )
        if result.returncode != status:
            fail(f"Claude opt-in installation must propagate status {status}: {result.stderr}")
        expected = expected_work_commands if status == 0 else expected_work_commands[:5]
        if command_log.read_text().splitlines() != expected:
            fail("only enabled Claude installations may run before cache and service application")

    uname_stub.write_text("#!/bin/sh\nprintf 'Linux\\n'\n")
    systemctl_stub = fake_bin / "systemctl"
    systemctl_stub.write_text(
        "#!/bin/sh\n"
        'printf \'systemctl %s\\n\' "$*" >>"$COMMAND_LOG"\n'
        'exit "${SYSTEMCTL_STATUS:-1}"\n'
    )
    systemctl_stub.chmod(0o755)
    deploy_client_runtime(fake_home)
    linux_prefix = expected_apply_commands[:5]
    systemd_probe = "systemctl --user show-environment"
    linux_service_apply = (
        f"mise -C {fake_checkout.resolve()} "
        "bootstrap linux systemd-units apply --yes"
    )
    absent_warning = (
        "warning: skipped service apply because the systemd user manager is unavailable"
    )
    linux_cases = (
        {
            "name": "missing systemd user manager",
            "env": {"SYSTEMCTL_STATUS": "1"},
            "commands": [*linux_prefix, systemd_probe],
            "warning": True,
        },
        {
            "name": "unrelated bootstrap skip",
            "env": {
                "SYSTEMCTL_STATUS": "1",
                "DOTFILES_BOOTSTRAP_SKIP": "user,not-linux-systemd-units",
            },
            "commands": [*linux_prefix, systemd_probe],
            "warning": True,
        },
        {
            "name": "intentional systemd unit skip",
            "env": {
                "SYSTEMCTL_STATUS": "1",
                "DOTFILES_BOOTSTRAP_SKIP": "linux-systemd-units,user",
            },
            "commands": [*linux_prefix, systemd_probe],
            "warning": False,
        },
        {
            "name": "intentional single-unit skip",
            "env": {
                "SYSTEMCTL_STATUS": "1",
                "DOTFILES_BOOTSTRAP_SKIP": " linux-systemd-units-yaskkserv2 ",
            },
            "commands": [*linux_prefix, systemd_probe],
            "warning": False,
        },
        {
            "name": "available systemd user manager",
            "env": {
                "SYSTEMCTL_STATUS": "0",
                "DOTFILES_BOOTSTRAP_SKIP": "linux-systemd-units",
            },
            "commands": [*linux_prefix, systemd_probe, linux_service_apply],
            "warning": False,
        },
    )
    for case in linux_cases:
        command_log.write_text("")
        case_env = dict(apply_env)
        case_env.pop("DOTFILES_BOOTSTRAP_SKIP", None)
        case_env.update(case["env"])
        result = subprocess.run(
            ["bash", str(fake_scripts / "apply.sh")],
            cwd=fake_checkout,
            env=case_env,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            fail(f"{case['name']}: apply must still succeed: {result.stderr}")
        if command_log.read_text().splitlines() != case["commands"]:
            fail(
                f"{case['name']}: unexpected apply commands: "
                f"{command_log.read_text().splitlines()}"
            )
        warned = absent_warning in result.stderr
        if warned != case["warning"]:
            fail(
                f"{case['name']}: systemd skip warning was {warned}: {result.stderr}"
            )
        if case["warning"] and result.stderr.strip() != absent_warning:
            fail(f"{case['name']}: unexpected stderr: {result.stderr}")
        if not case["warning"] and "systemd user manager" in result.stderr:
            fail(f"{case['name']}: unexpected systemd warning: {result.stderr}")


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
    claude_stub = fake_bin / "claude"
    claude_stub.write_text("#!/bin/sh\nexit 0\n")
    claude_stub.chmod(0o755)
    herdr_stub = fake_bin / "herdr"
    herdr_stub.write_text(
        "#!/bin/sh\n"
        'test "$1 $2 $3" = "integration install claude" || exit 1\n'
        'touch "$HOME/herdr-called"\n'
    )
    herdr_stub.chmod(0o755)
    uname_stub = fake_bin / "uname"
    uname_stub.write_text('#!/bin/sh\nprintf "%s\\n" "$TEST_UNAME"\n')
    uname_stub.chmod(0o755)
    configure_env = dict(os.environ)
    configure_env.update(
        HOME=str(fake_home),
        PATH=f"{fake_bin}:/usr/bin:/bin",
        TEST_UNAME="Darwin",
    )
    configure_script = ["bash", str(ROOT / "scripts/configure-herdr.sh")]
    mac_result = subprocess.run(configure_script, cwd=ROOT, env=configure_env, check=False)
    if mac_result.returncode != 0 or (fake_home / "herdr-called").exists():
        fail("Herdr integration must not run on macOS")
    configure_env["TEST_UNAME"] = "Linux"
    for enabled in (False, True):
        deploy_client_runtime(fake_home, {"claude_work_enabled": enabled})
        linux_result = subprocess.run(configure_script, cwd=ROOT, env=configure_env, check=False)
        if linux_result.returncode != 0 or (fake_home / "herdr-called").is_file() != enabled:
            fail("Herdr must install only the opted-in Claude integration on Linux")
