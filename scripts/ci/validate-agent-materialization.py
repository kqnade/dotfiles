#!/usr/bin/env python3

"""Validate managed agent settings and runtime-state preservation."""

import json
import os
import subprocess
import tempfile
import tomllib
from pathlib import Path

from validate_common import ROOT, fail


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
    "model": "gpt-6-astra",
    "model_reasoning_effort": "medium",
}
for key, expected_value in expected_codex_defaults.items():
    if codex_modified_config.get(key) != expected_value:
        fail(f"Codex config modifier did not enforce {key}")

if codex_modified_config.get("features", {}).get("hooks") is not True:
    fail("Codex config modifier must enable lifecycle hooks")

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

pi_settings_source = ROOT / "dot_pi/agent/settings.json"
if not pi_settings_source.is_file():
    fail("Canonical Pi settings source is missing")

pi_runtime_settings = {
    "defaultProvider": "runtime-provider",
    "defaultModel": "runtime-model",
    "defaultThinkingLevel": "low",
    "runtimeMarker": "must-be-replaced",
    "packages": ["npm:runtime-package@1.0.0"],
}

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

    pi_settings = codex_home / ".pi" / "agent" / "settings.json"
    pi_settings.parent.mkdir(parents=True)
    pi_settings.write_text(json.dumps(pi_runtime_settings))
    pi_apply_result = subprocess.run(
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
            ".pi/agent/settings.json",
        ],
        cwd=codex_home,
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, "HOME": str(codex_home)},
    )
    if pi_apply_result.returncode != 0:
        fail(f"Pi settings apply failed: {pi_apply_result.stderr.strip()}")
    rendered_pi_settings = json.loads(pi_settings.read_text())
    expected_pi_defaults = {
        "defaultProvider": "openai-codex",
        "defaultModel": "gpt-6-sol",
        "defaultThinkingLevel": "xhigh",
    }
    for key, expected_value in expected_pi_defaults.items():
        if rendered_pi_settings.get(key) != expected_value:
            fail(f"Canonical Pi settings did not enforce {key}")
    expected_pi_packages = [
        "npm:pi-footer@0.5.1",
        "npm:pi-subagents@0.67.0",
        "npm:pi-web-access@0.28.0",
        "git:github.com/trotsky1997/pi-lsp-extension@39d56f0cdaf4b5e77ee038f0670de14cd19e228d",
    ]
    if rendered_pi_settings.get("packages") != expected_pi_packages:
        fail("Canonical Pi settings did not deploy the complete package set")
    if "runtimeMarker" in rendered_pi_settings:
        fail("Canonical Pi settings preserved machine-local runtime state")
    if rendered_pi_settings.get("modelThinkingLevels", {}).get(
        "openai-codex/gpt-6-sol"
    ) != "xhigh":
        fail("Canonical Pi settings did not pin GPT-6 Sol to xhigh thinking")
    if rendered_pi_settings.get("subagents", {}).get("defaultModel") != (
        "openai-codex/gpt-6-luna"
    ):
        fail("Canonical Pi settings did not pin subagents to GPT-6 Luna")
    configured_typescript_server = (
        rendered_pi_settings.get("lsp", {}).get("servers", {}).get("typescript")
    )
    if configured_typescript_server != {
        "command": "tsc",
        "args": ["--lsp", "--stdio"],
    }:
        fail("Canonical Pi settings did not deploy the TypeScript 7 native LSP")
