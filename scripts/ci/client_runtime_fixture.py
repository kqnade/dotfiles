"""Render managed runtime settings for isolated test homes."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def deploy_client_runtime(home, overrides=None):
    target = Path(home) / ".config/dotfiles/client-runtime.sh"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        subprocess.check_output(
            [
                "chezmoi",
                "--source",
                str(ROOT),
                "--override-data",
                json.dumps({"claude_work_enabled": False, **(overrides or {})}),
                "execute-template",
                "--file",
                str(ROOT / "dot_config/dotfiles/client-runtime.sh.tmpl"),
            ],
            text=True,
        )
    )
    return target
