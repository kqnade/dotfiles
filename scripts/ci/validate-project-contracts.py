#!/usr/bin/env python3

"""Validate project, platform, and bootstrap invariants."""

from __future__ import annotations

import json
import re
import subprocess
import tomllib

from validate_common import ROOT, fail, strip_json_comments


try:
    json.loads(strip_json_comments((ROOT / "renovate.jsonc").read_text()))
except json.JSONDecodeError as error:
    fail(f"invalid JSONC in renovate.jsonc: {error}")
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

nvim_plugins = (ROOT / "dot_config/nvim/lua/modules/plugins.lua").read_text()
if not re.search(
    r'\{\s*"HiPhish/rainbow-delimiters\.nvim",\s*submodules = false,\s*\}',
    nvim_plugins,
):
    fail("rainbow-delimiters must not clone its development submodules")

nvim_lint = (ROOT / "dot_config/nvim/lua/modules/configs/editor/lint.lua").read_text()
nvim_lsp = (ROOT / "dot_config/nvim/lua/modules/configs/lsp/init.lua").read_text()
if 'lua = { "luacheck" }' in nvim_lint or '    "luacheck",' in nvim_lsp:
    fail("Lua must rely on lua_ls instead of the unavailable luacheck executable")

nvim_treesitter = (ROOT / "dot_config/nvim/lua/modules/configs/treesitter.lua").read_text()
if re.search(r'^\s+"jsonc",$', nvim_treesitter, re.MULTILINE):
    fail("Tree-sitter must install parser names, not the built-in jsonc alias")

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

with (ROOT / "mise.toml").open("rb") as stream:
    mise_min_version = tomllib.load(stream).get("min_version")
if f'readonly MISE_MIN_VERSION="{mise_min_version}"\n' not in installer:
    fail("installer mise version must match min_version")
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

print("validated project, WSL, bootstrap, Neovim, Colemak, and SKK invariants")
