#!/usr/bin/env python3

"""Validate the v2 mise manifest and its multi-platform lockfile."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PLATFORMS = ("macos-arm64", "macos-x64", "linux-x64")

EXPECTED_TOOLS = {
    "1password-cli",
    "aqua:babarot/gomi",
    "atuin",
    "bat",
    "btop",
    "bun",
    "cargo:atuin",
    "cargo:eza",
    "cargo:fd-find",
    "cargo:git-delta",
    "cargo:https://github.com/wachikun/yaskkserv2",
    "cargo:sheldon",
    "chezmoi",
    "claude",
    "codex",
    "delta",
    "fd",
    "fzf",
    "gh",
    "ghq",
    "git-lfs",
    "herdr",
    "jq",
    "just",
    "neovim",
    "node",
    "npm:ccusage",
    "npm:pnpm",
    "opencode",
    "pnpm",
    "ripgrep",
    "rust",
    "shellcheck",
    "sheldon",
    "shfmt",
    "starship",
    "taplo",
    "tree-sitter",
    "typos",
    "uv",
    "yq",
    "zoxide",
}

INTEL_FALLBACKS = {
    "cargo:atuin",
    "cargo:fd-find",
    "cargo:git-delta",
    "cargo:sheldon",
    "npm:pnpm",
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
lock = load_toml(ROOT / "mise.lock")

if config.get("min_version") != "2026.7.5":
    fail("min_version must remain 2026.7.5")

settings = config.get("settings", {})
if tuple(settings.get("lockfile_platforms", ())) != PLATFORMS:
    fail(f"lockfile_platforms must be exactly {PLATFORMS!r}")
if settings.get("system_packages", {}).get("managers") != ["dnf", "pacman"]:
    fail("only dnf and pacman may manage bootstrap packages")
if settings.get("npm", {}).get("package_manager") != "npm":
    fail("npm tools must use Node's npm so npm:pnpm has no pnpm bootstrap cycle")
if settings.get("task", {}).get("run_auto_install") is not False:
    fail("public tasks must not implicitly install tools")

tools = config.get("tools", {})
tool_names = set(tools)
if tool_names != EXPECTED_TOOLS:
    fail(
        "tool allowlist mismatch; "
        f"missing={sorted(EXPECTED_TOOLS - tool_names)}, "
        f"unexpected={sorted(tool_names - EXPECTED_TOOLS)}"
    )

for name, value in tools.items():
    version = configured_version(value)
    if version in {"latest", "stable", "lts"} or any(char in version for char in "*^~"):
        fail(f"{name} is not explicitly pinned: {version}")

for fallback in INTEL_FALLBACKS:
    value = tools[fallback]
    if not isinstance(value, dict) or value.get("os") != ["macos/x64"]:
        fail(f"{fallback} must be restricted to macos/x64")

for primary in ("atuin", "fd", "delta", "sheldon", "pnpm"):
    value = tools[primary]
    if not isinstance(value, dict) or "macos/x64" in value.get("os", []):
        fail(f"{primary} must not be selected on macos/x64")

lock_tools = lock.get("tools", {})
if set(lock_tools) != EXPECTED_TOOLS:
    fail(
        "lockfile tool set mismatch; "
        f"missing={sorted(EXPECTED_TOOLS - set(lock_tools))}, "
        f"unexpected={sorted(set(lock_tools) - EXPECTED_TOOLS)}"
    )

for name, value in tools.items():
    requested_version = configured_version(value)
    locked_entries = lock_tools[name]
    if not any(entry.get("version") == requested_version for entry in locked_entries):
        fail(f"{name}@{requested_version} is not present in mise.lock")

    backend = locked_entries[-1].get("backend", name)
    source_backend = backend.startswith(("cargo:", "npm:"))
    if source_backend or name in NON_URL_LOCKS:
        continue

    for platform in PLATFORMS:
        if not active_on(value, platform):
            continue
        key = f"platforms.{platform}"
        if not any(entry.get(key, {}).get("url") for entry in locked_entries):
            fail(f"{name} has no locked URL for {platform}")

config_template = (ROOT / "dot_config/mise/config.toml.tmpl").read_text().strip()
lock_template = (ROOT / "dot_config/mise/mise.lock.tmpl").read_text().strip()
if config_template != '{{ include "mise.toml" -}}':
    fail("deployed mise config must include the root mise.toml verbatim")
if lock_template != '{{ include "mise.lock" -}}':
    fail("deployed mise lockfile must include the root mise.lock verbatim")

print(f"validated {len(tools)} pinned tools across {len(PLATFORMS)} platforms")
