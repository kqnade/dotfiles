"""Render managed client settings for isolated test homes."""

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def render_pi_settings():
    environment = dict(os.environ)
    environment.pop("PI_CODING_AGENT_DIR", None)
    return json.loads(
        subprocess.check_output(
            [
                "chezmoi",
                "--source",
                str(ROOT),
                "execute-template",
                "--file",
                str(ROOT / "dot_pi/agent/settings.json.tmpl"),
            ],
            env=environment,
            text=True,
        )
    )


def deploy_client_runtime(home, overrides=None):
    target = Path(home) / ".config/dotfiles/client-runtime.sh"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        subprocess.check_output(
            [
                "chezmoi",
                "--source",
                str(ROOT),
                "--override-data", json.dumps(overrides or {}),
                "execute-template",
                "--file",
                str(ROOT / "dot_config/dotfiles/client-runtime.sh.tmpl"),
            ],
            text=True,
        )
    )
    return target
