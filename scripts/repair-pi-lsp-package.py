#!/usr/bin/env python3
"""Repair host-provided dependencies in the installed Pi LSP package."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile


HOST_PACKAGES = (
    "@mariozechner/pi-ai",
    "@mariozechner/pi-coding-agent",
    "@mariozechner/pi-tui",
    "@sinclair/typebox",
)


def repair(manifest_path: Path) -> None:
    try:
        content = manifest_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"Pi LSP package is not installed; skipping {manifest_path}")
        return
    manifest = json.loads(content)
    if not isinstance(manifest, dict) or manifest.get("name") != "lsp-pi":
        raise ValueError("expected the lsp-pi package manifest")
    dependencies = manifest.get("dependencies", {})
    peers = manifest.get("peerDependencies", {})
    if not isinstance(dependencies, dict) or not isinstance(peers, dict):
        raise ValueError("dependencies and peerDependencies must be objects")

    modules = [manifest_path.parent / "node_modules" / name for name in HOST_PACKAGES]
    for module in modules:
        if not module.exists() and not module.is_symlink():
            continue
        for parent in module.parents:
            if parent == manifest_path.parent:
                break
            if parent.is_symlink():
                raise ValueError(f"host package parent is a symlink: {parent}")

    changed = False
    for name in HOST_PACKAGES:
        if name in dependencies:
            del dependencies[name]
            peers[name] = "*"
            changed = True
        elif name in peers and peers[name] != "*":
            peers[name] = "*"
            changed = True

    if changed:
        manifest["peerDependencies"] = peers
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=manifest_path.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            try:
                json.dump(manifest, stream, indent=2, ensure_ascii=False)
                stream.write("\n")
                stream.flush()
                temporary.chmod(manifest_path.stat().st_mode & 0o777)
                temporary.replace(manifest_path)
            finally:
                temporary.unlink(missing_ok=True)
        print(f"Repaired Pi LSP host package peers in {manifest_path}")

    for module in modules:
        if module.is_symlink():
            module.unlink()
        elif module.exists():
            shutil.rmtree(module)
        else:
            continue
        print(f"Removed installed host package copy {module}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("agent_dir", type=Path)
    args = parser.parse_args()
    manifest_path = (
        args.agent_dir / "git/github.com/trotsky1997/pi-lsp-extension/package.json"
    )
    try:
        repair(manifest_path)
    except (OSError, ValueError) as error:
        print(f"Failed to repair {manifest_path}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
