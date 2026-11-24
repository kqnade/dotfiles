#!/usr/bin/env python3

"""Validate the v2 mise manifest and its multi-platform lockfile."""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PLATFORMS = ("macos-arm64", "macos-x64", "linux-x64")

INTEL_FALLBACKS = {
    "cargo:git-delta",
    "cargo:sheldon",
}

NON_URL_LOCKS = {"rust"}

def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_toml(path: Path) -> dict[str, Any]:
    with path.open("rb") as stream:
        return tomllib.load(stream)


def configured_version(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict) and isinstance(value.get("version"), str):
        return value["version"]
    fail(f"tool entry has no explicit version: {value!r}")


def active_on(value: Any, platform: str) -> bool:
    if not isinstance(value, dict) or "os" not in value:
        return True

    os_name, arch = platform.split("-", 1)
    for selector in value["os"]:
        if selector == os_name or selector == f"{os_name}/{arch}":
            return True
    return False


config = load_toml(ROOT / "mise.toml")
bootstrap_config = load_toml(ROOT / "mise/config.toml")
overlapping_sections = set(config) & set(bootstrap_config)
if overlapping_sections:
    fail(
        "split mise manifests must own disjoint top-level sections: "
        f"{sorted(overlapping_sections)}"
    )
config.update(bootstrap_config)
lock = load_toml(ROOT / "mise.lock")

settings = config.get("settings", {})
if settings.get("system_packages", {}).get("managers") != [
    "dnf",
    "pacman",
    "brew-cask",
]:
    fail("only dnf, pacman, and brew-cask may manage bootstrap packages")
if settings.get("npm", {}).get("package_manager") != "auto":
    fail("npm tools must use mise's embedded installer")
if settings.get("task", {}).get("run_auto_install") is not False:
    fail("public tasks must not implicitly install tools")

packages = config.get("bootstrap", {}).get("packages", {})
if any(version != "latest" for version in packages.values()):
    fail("bootstrap packages must use the package manager's current version")
if "dnf:openssl3-devel" in packages or "dnf:openssl-devel" in packages:
    fail(
        "Fedora OpenSSL headers depend on the release; "
        "scripts/install-openssl-dev.sh selects openssl-devel before 45 "
        "and openssl3-devel from 45"
    )
pre_tools = config.get("bootstrap", {}).get("hooks", {}).get("pre-tools")
pre_tools_run = pre_tools.get("run") if isinstance(pre_tools, dict) else pre_tools
if (
    pre_tools_run
    != 'bash "${DOTFILES_ROOT:-$HOME/repos/github.com/kqnade/dotfiles}/scripts/install-openssl-dev.sh"'
):
    fail("bootstrap must install Fedora OpenSSL 3 headers before building tools")
if packages.get("pacman:openssl-3") != "latest":
    fail("Arch must install the OpenSSL 3 compatibility package for yaskkserv2")

tools = dict(config.get("tools", {}))
work_manifest = load_toml(ROOT / "mise.work.toml")
if set(work_manifest.get("tools", {})) != {"claude"}:
    fail("the work opt-in manifest must contain only Claude Code")
work_lock = load_toml(ROOT / "mise.work.lock")
if set(work_lock.get("tools", {})) != set(work_manifest["tools"]):
    fail("work lockfile must contain exactly the opted-in tools")
if set(lock["tools"]) & set(work_lock["tools"]):
    fail("standard and work lockfiles must not overlap")
lock["tools"].update(work_lock["tools"])
tools.update(work_manifest["tools"])
tool_names = set(tools)
for name, value in tools.items():
    version = configured_version(value)
    if version in {"latest", "stable", "lts"} or any(char in version for char in "*^~"):
        fail(f"{name} is not explicitly pinned: {version}")

if tuple(map(int, configured_version(tools["python"]).split("."))) < (3, 11):
    fail("Python must be at least 3.11 for tomllib-based validators")

if "deno" not in tools:
    fail("Deno must be pinned so denops and skkeleton can start")
deno_version = tuple(int(part) for part in configured_version(tools["deno"]).split("."))
deno_version += (0,) * (3 - len(deno_version))
if deno_version < (2, 3, 0):
    fail("Deno must be at least 2.3.0 so denops and skkeleton can start")

eza = tools["cargo:eza"]
if not isinstance(eza, dict) or eza.get("features") != ["vendored-libgit2"]:
    fail("eza must build its bundled libgit2 instead of linking a system copy")

herdr = tools["herdr"]
if not isinstance(herdr, dict) or herdr.get("os") != ["linux"]:
    fail("Herdr must be selected only on Linux")

atuin = tools["github:atuinsh/atuin"]
if not isinstance(atuin, str):
    fail("Atuin must use the GitHub backend for upstream platform binaries")

mole = tools["http:mole"]
if not isinstance(mole, dict) or mole.get("os") != ["macos"]:
    fail("Mole must be selected only on macOS")
if not isinstance(mole.get("url"), str) or not re.fullmatch(r"https://[^/\s]+(?:/.*)?", mole["url"]):
    fail("Mole must use an HTTPS archive URL")
if not isinstance(mole.get("checksum"), str) or not re.fullmatch(r"sha256:[0-9a-fA-F]{64}", mole["checksum"]):
    fail("Mole must define a SHA-256 archive checksum")
if type(mole.get("strip_components")) is not int:
    fail("Mole strip_components must be an integer")
for field in ("bin_path", "postinstall"):
    if not isinstance(mole.get(field), str) or not mole[field].strip():
        fail(f"Mole {field} must be a non-empty string")

for fallback in INTEL_FALLBACKS:
    value = tools[fallback]
    if not isinstance(value, dict) or value.get("os") != ["macos/x64"]:
        fail(f"{fallback} must be restricted to macos/x64")

for primary in ("delta", "sheldon"):
    value = tools[primary]
    if active_on(value, "macos-x64"):
        fail(f"{primary} must not be selected on macos/x64")
for binary in (
    "github:atuinsh/atuin",
    "github:pnpm/pnpm",
    "github:sharkdp/fd",
):
    if not active_on(tools[binary], "macos-x64"):
        fail(f"{binary} must use its upstream binary on macos-x64")

yaskkserv2 = tools["cargo:https://github.com/wachikun/yaskkserv2"]
if not isinstance(yaskkserv2, dict) or yaskkserv2.get("install_env") != {
    "CARGO_NET_GIT_FETCH_WITH_CLI": "true",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "PKG_CONFIG_PATH": "/usr/lib/openssl-3/pkgconfig",
}:
    fail("yaskkserv2 must use HTTPS through an isolated Git CLI and the OpenSSL 3 pkg-config prefix")

lock_tools = lock.get("tools", {})
lock_platforms = {
    "-".join(key.removeprefix("platforms.").split("-")[:2])
    for entries in lock_tools.values()
    for entry in entries
    for key in entry
    if key.startswith("platforms.")
}
if lock_platforms != set(PLATFORMS):
    fail(f"mise.lock platforms must be exactly {PLATFORMS!r}")
if set(lock_tools) != tool_names:
    fail(
        "lockfile tool set mismatch; "
        f"missing={sorted(tool_names - set(lock_tools))}, "
        f"unexpected={sorted(set(lock_tools) - tool_names)}"
    )

if lock_tools["cargo:eza"][-1].get("options") != {
    "features": "vendored-libgit2"
}:
    fail("eza lock entry must preserve its vendored-libgit2 build option")

if lock_tools["http:mole"][-1].get("options") != {"strip_components": "1"}:
    fail("Mole lock entry must strip the source archive root directory")

for name, value in tools.items():
    requested_version = configured_version(value)
    locked_entries = lock_tools[name]
    requested_entries = [
        entry for entry in locked_entries if entry.get("version") == requested_version
    ]
    if not requested_entries:
        fail(f"{name}@{requested_version} is not present in mise.lock")

    backend = requested_entries[-1].get("backend", name)
    source_backend = backend.startswith(("cargo:", "npm:"))
    if source_backend or name in NON_URL_LOCKS:
        continue

    for platform in PLATFORMS:
        if not active_on(value, platform):
            continue
        key = f"platforms.{platform}"
        if not any(entry.get(key, {}).get("url") for entry in requested_entries):
            fail(f"{name}@{requested_version} has no locked URL for {platform}")

config_template = (ROOT / "dot_config/mise/config.toml.tmpl").read_text().strip()
lock_template = (ROOT / "dot_config/mise/mise.lock.tmpl").read_text().strip()
if config_template != (
    '{{ include "mise.toml" }}\n{{ include "mise/config.toml" }}\n'
    '{{ if eq (includeTemplate ".chezmoitemplates/claude-work-enabled.tmpl" .) "true" -}}\n'
    '{{ include "mise.work.toml" -}}\n{{ end -}}'
):
    fail("deployed mise config must concatenate the split manifest sources")
if lock_template != (
    '{{ include "mise.lock" }}\n'
    '{{ if eq (includeTemplate ".chezmoitemplates/claude-work-enabled.tmpl" .) "true" -}}\n'
    '{{ include "mise.work.lock" -}}\n{{ end -}}'
):
    fail("deployed mise lockfile must combine the standard and enabled work locks")

print(f"validated {len(tools)} pinned tools across {len(PLATFORMS)} platforms")
