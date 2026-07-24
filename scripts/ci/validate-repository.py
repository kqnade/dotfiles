#!/usr/bin/env python3

"""Check v2 removals and the configuration that must survive the reset."""

from __future__ import annotations

import json
import subprocess
import sys
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


removed_paths = (
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
):
    if not (ROOT / required).is_file():
        fail(f"required v2 file is missing: {required}")

removals = (ROOT / ".chezmoiremove").read_text().splitlines()
for target in (
    ".config/project-maker",
    ".config/zsh/" + "agent-mail.zsh",
    ".kimi-code/mcp.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1",
    "Library/LaunchAgents/com.user.yaskkserv2.plist",
    ".config/systemd/user/yaskkserv2.service",
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

try:
    renovate = json.loads(strip_json_comments((ROOT / "renovate.jsonc").read_text()))
except json.JSONDecodeError as error:
    fail(f"invalid JSONC in renovate.jsonc: {error}")
if renovate.get("minimumReleaseAge") != "14 days":
    fail("Renovate minimumReleaseAge must remain 14 days")
if renovate.get("lockFileMaintenance", {}).get("enabled") is not True:
    fail("Renovate lockFileMaintenance must remain enabled")
if "customManagers" in renovate:
    fail("Renovate must use the standard mise manager, not customManagers")

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

workflow = (ROOT / ".github/workflows/ci.yml").read_text()
if "--dry-" + "run" in workflow:
    fail("CI must execute bootstrap interfaces instead of previewing them")
for fragment in (
    "bash install.sh",
    "mise run apply",
    "mise run doctor",
    "mise bootstrap --yes",
    'DOTFILES_ROOT="$update_root" mise -C "$update_root" run update',
    "mise bootstrap packages apply --yes",
    "cargo:sheldon",
    "cargo:git-delta",
    "cargo:fd-find",
    "cargo:atuin",
    "npm:pnpm",
    "dotfiles_wait_for_port 127.0.0.1 1178",
):
    if fragment not in workflow:
        fail(f"CI no longer executes required integration path: {fragment}")

for relative in (
    "scripts/apply.sh",
    "scripts/bootstrap.sh",
    "scripts/build-skk-dictionary.sh",
    "scripts/doctor.sh",
    "scripts/update.sh",
    "scripts/yaskkserv2-serve.sh",
):
    script = (ROOT / relative).read_text()
    if "scripts/lib/runtime.sh" not in script:
        fail(f"{relative} must use the shared bootstrap runtime")
    if 'readonly DOTFILES_ROOT="${HOME}/repos/' in script:
        fail(f"{relative} must not hard-code the checkout path")

print(
    "validated removals, JSON, public CI paths, WSL proxies, "
    "Neovim, Colemak, and SKK"
)
