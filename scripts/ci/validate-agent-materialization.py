#!/usr/bin/env python3

"""Validate agent rules, skills, and canonical materialization invariants."""

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

from validate_common import (
    EXPECTED_AGENT_SKILLS as expected_agent_skills,
    EXPECTED_CLAUDE_RULE_TARGETS as expected_claude_rule_targets,
    ROOT,
    fail,
    strip_json_comments,
    tracked_files,
)


removed_paths = (
    ".chezmoitemplates/ai-voice.md",
    "Brew" + "file",
    "Dnffile",
    "sco" + "op" + "file.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl",
    "run_onchange_install-" + "sco" + "op-packages.ps1.tmpl",
    "run_onchange_setup-" + "ms" + "ys2.ps1.tmpl",
    "run_onchange_setup-xdg-env.ps1.tmpl",
    "docs/setup-" + "windows.md",
    "scripts/install-linux.sh",
    "dot_config/project-maker",
    "dot_config/zsh/" + "agent-" + "mail.zsh",
    "dot_claude/agents/frontend-designer.md",
    "dot_claude/CLAUDE.md.tmpl",
    "dot_claude/hooks/executable_auto-test.sh",
    "dot_claude/skills/catchup/SKILL.md",
    "dot_codex/AGENTS.md.tmpl",
    "dot_config/opencode/AGENTS.md.tmpl",
    "dot_config/opencode/plugins/claude-rules.ts",
    "dot_kimi-code/AGENTS.md.tmpl",
    "dot_kimi-code/mcp.json",
    "run_onchange_before_install-" + "mcp-" + "agent-" + "mail.sh.tmpl",
    "run_onchange_before_install-" + "mcp-" + "agent-" + "mail.ps1.tmpl",
    "run_onchange_after_configure-" + "agent-" + "mail.sh.tmpl",
    "run_onchange_after_configure-" + "agent-" + "mail.ps1.tmpl",
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

claude_coding_rule_link = ROOT / "dot_claude/rules/symlink_coding.md"
if not claude_coding_rule_link.is_file():
    fail("Claude shared coding rule symlink source is missing")
if claude_coding_rule_link.read_text().strip() != "../../.agents/rules/coding.md":
    fail("Claude coding rule must link to the canonical shared rule")

shared_workflow_state_rule = ROOT / "dot_agents/rules/workflow-state.md"
if not shared_workflow_state_rule.is_file():
    fail("shared workflow-state rule is missing")

claude_workflow_state_link = ROOT / "dot_claude/rules/symlink_workflow-state.md"
if not claude_workflow_state_link.is_file():
    fail("Claude workflow-state rule symlink source is missing")
if (
    claude_workflow_state_link.read_text().strip()
    != "../../.agents/rules/workflow-state.md"
):
    fail("Claude workflow-state rule must link to the canonical shared rule")

for rule_name in expected_claude_rule_sources - {
    "symlink_coding.md",
    "symlink_workflow-state.md",
}:
    rule_text = (ROOT / "dot_claude/rules" / rule_name).read_text()
    if rule_text.startswith("---\n"):
        fail(f"Claude global rule must remain unconditional: {rule_name}")

codex_global_rule = ROOT / "dot_agents/rules/git.md"
if not codex_global_rule.is_file():
    fail("Codex global Git rule is missing")

codex_delegation_rule = ROOT / "dot_agents/rules/delegation.md"
if not codex_delegation_rule.is_file():
    fail("Codex global delegation rule is missing")

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
    "approvals_reviewer": "auto_review",
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
    "classify each packet by model fit",
    "independently verifiable and committable features",
    "implemented concurrently in isolated worktrees",
    "return it to the parent",
    "`route-large-implementation`",
    "spawn subagents",
    "`spark_worker`",
    "mechanical or repetitive edits",
    "targeted searches",
    "test execution",
    "granular UI adjustments",
    "Use gpt-5.6-luna at max",
    "ambiguous diagnosis",
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

codex_spark_worker = ROOT / "dot_codex/agents/spark-worker.toml"
if not codex_spark_worker.is_file():
    fail("Codex Spark worker agent is missing")
codex_spark_worker_config = tomllib.loads(codex_spark_worker.read_text())
normalized_spark_worker_instructions = " ".join(
    codex_spark_worker_config.get("developer_instructions", "").split()
)
expected_spark_worker = {
    "name": "spark_worker",
    "model": "gpt-5.3-codex-spark",
    "model_reasoning_effort": "high",
}
for key, expected_value in expected_spark_worker.items():
    if codex_spark_worker_config.get(key) != expected_value:
        fail(f"Codex Spark worker did not enforce {key}")
for required_fragment in (
    "bounded, low-ambiguity task",
    "mechanical or repetitive edits",
    "granular UI adjustments",
    "requirements, architecture, or security-sensitive decisions",
    "not alone in the codebase",
    "Stop and return evidence",
    "verify",
):
    if required_fragment not in normalized_spark_worker_instructions:
        fail("Codex Spark worker is missing reviewed behavior")

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
