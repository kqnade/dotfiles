#!/usr/bin/env python3

"""Validate public project, CI, platform, and bootstrap invariants."""

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

from validate_common import ROOT, fail, strip_json_comments, tracked_files


try:
    renovate = json.loads(strip_json_comments((ROOT / "renovate.jsonc").read_text()))
except json.JSONDecodeError as error:
    fail(f"invalid JSONC in renovate.jsonc: {error}")
if renovate.get("minimumReleaseAge") != "1 day":
    fail("Renovate minimumReleaseAge must remain 1 day")
if renovate.get("timezone") != "Asia/Tokyo":
    fail("Renovate timezone must remain Asia/Tokyo")
if renovate.get("schedule") != ["at any time"]:
    fail("Renovate must allow dependency PRs at any time")
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
if not any(
    rule.get("matchManagers") == ["mise"]
    and rule.get("matchDatasources") == ["github-tags"]
    and rule.get("matchPackageNames") == ["openai/codex"]
    and rule.get("extractVersion") == r"^rust-v(?<version>\d+\.\d+\.\d+)$"
    and rule.get("versioning") == "semver"
    and rule.get("enabled") is not False
    for rule in renovate.get("packageRules", [])
):
    fail("Renovate must track stable Codex CLI releases from rust-v tags")
if not any(
    rule.get("matchManagers") == ["mise"]
    and rule.get("matchDepNames")
    == ["claude", "aqua:openai/codex", "herdr", "opencode"]
    and rule.get("minimumReleaseAge") is None
    and rule.get("enabled") is not False
    for rule in renovate.get("packageRules", [])
):
    fail("Renovate must track AI tools without the default release cooldown")

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

workflow = (ROOT / ".github/workflows/ci.yml").read_text()
with (ROOT / "mise.toml").open("rb") as stream:
    mise_min_version = tomllib.load(stream).get("min_version")
if f"  MISE_VERSION: v{mise_min_version}\n" not in workflow:
    fail("CI mise version must match min_version")
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
repository_validator_commands = (
    "mise exec -- python3 scripts/ci/validate-shell-integrations.py",
    "mise exec -- python3 scripts/ci/validate-claude-authorization.py",
    "mise exec -- python3 scripts/ci/validate-agent-materialization.py",
    "mise exec -- python3 scripts/ci/validate-workflow-state.py",
    "mise exec -- python3 scripts/ci/validate-repository-layout.py",
    "mise exec -- python3 scripts/ci/validate-agent-client-config.py",
    "mise exec -- python3 scripts/ci/validate-project-contracts.py",
)

zsh_install = "sudo apt-get install --yes zsh"
if zsh_install not in static_job:
    fail("CI static validation must install zsh")
if static_job.index(zsh_install) > static_job.index(repository_validator_commands[0]):
    fail("CI static validation must install zsh before running the repository validator")

codex_config_tools_install = "mise install --locked chezmoi yq"
if codex_config_tools_install not in static_job:
    fail("CI static validation must install chezmoi and yq")
if static_job.index(codex_config_tools_install) > static_job.index(
    repository_validator_commands[2]
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
