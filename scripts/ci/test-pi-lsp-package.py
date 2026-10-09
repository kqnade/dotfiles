#!/usr/bin/env python3
"""Behavior tests for the installed Pi LSP package repair."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from client_runtime_fixture import deploy_client_runtime


ROOT = Path(__file__).resolve().parents[2]
REPAIR = ROOT / "scripts/repair-pi-lsp-package.py"
PACKAGE_PATH = Path("git/github.com/trotsky1997/pi-lsp-extension")
HOST_PACKAGES = (
    "@mariozechner/pi-ai",
    "@mariozechner/pi-coding-agent",
    "@mariozechner/pi-tui",
    "@sinclair/typebox",
)


class PiLspPackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.agent_dir = self.home / "custom-agent"
        self.package_dir = self.agent_dir / PACKAGE_PATH
        self.manifest_path = self.package_dir / "package.json"
        self.manifest = {
            "name": "lsp-pi",
            "version": "1.0.5",
            "pi": {"extensions": ["./lsp.ts", "./debug.ts"]},
            "dependencies": {
                "@sinclair/typebox": "^0.34.33",
                "vscode-languageserver-protocol": "~3.17.5",
                "zod": "^4.1.12",
            },
            "peerDependencies": {name: "^0.66.0" for name in HOST_PACKAGES[:-1]},
            "devDependencies": {"typescript": "^5.9.3"},
        }

    def write_manifest(self):
        self.package_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path.write_text(json.dumps(self.manifest, indent=2) + "\n")

    def run_repair(self):
        return subprocess.run(
            [sys.executable, str(REPAIR), str(self.agent_dir)],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_moves_host_dependency_to_wildcard_peers_and_preserves_other_fields(self):
        self.write_manifest()
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = dict(self.manifest)
        expected["dependencies"] = {
            name: version
            for name, version in self.manifest["dependencies"].items()
            if name != "@sinclair/typebox"
        }
        expected["peerDependencies"] = {name: "*" for name in HOST_PACKAGES}
        self.assertEqual(json.loads(self.manifest_path.read_text()), expected)

    def test_removes_only_installed_host_copies(self):
        self.write_manifest()
        for name in (*HOST_PACKAGES, "zod"):
            module = self.package_dir / "node_modules" / name
            module.mkdir(parents=True)
            (module / "package.json").write_text("{}")
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in HOST_PACKAGES:
            self.assertFalse((self.package_dir / "node_modules" / name).exists())
        self.assertTrue((self.package_dir / "node_modules/zod/package.json").is_file())

    def test_removes_module_symlink_without_deleting_its_target(self):
        self.write_manifest()
        target = self.home / "shared-typebox"
        target.mkdir()
        (target / "package.json").write_text("{}")
        module = self.package_dir / "node_modules/@sinclair/typebox"
        module.parent.mkdir(parents=True)
        module.symlink_to(target, target_is_directory=True)
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(module.is_symlink())
        self.assertTrue((target / "package.json").is_file())

    def test_does_not_delete_modules_through_a_shared_parent_symlink(self):
        self.write_manifest()
        shared = self.home / "shared-modules"
        (shared / "typebox").mkdir(parents=True)
        namespace = self.package_dir / "node_modules/@sinclair"
        namespace.parent.mkdir(parents=True)
        namespace.symlink_to(shared, target_is_directory=True)
        result = self.run_repair()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(namespace), result.stderr)
        self.assertTrue((shared / "typebox").is_dir())

    def test_does_not_delete_sources_through_parent_symlinks_inside_the_package(self):
        self.write_manifest()
        sources = self.package_dir / "src"
        (sources / "typebox").mkdir(parents=True)
        namespace = self.package_dir / "node_modules/@sinclair"
        namespace.parent.mkdir(parents=True)
        namespace.symlink_to(sources, target_is_directory=True)
        original = self.manifest_path.read_bytes()
        result = self.run_repair()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(namespace), result.stderr)
        self.assertTrue((sources / "typebox").is_dir())
        self.assertEqual(self.manifest_path.read_bytes(), original)

    def test_does_not_clean_a_symlinked_node_modules_directory(self):
        self.write_manifest()
        sources = self.package_dir / "src"
        (sources / "@sinclair/typebox").mkdir(parents=True)
        modules = self.package_dir / "node_modules"
        modules.symlink_to(sources, target_is_directory=True)
        result = self.run_repair()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(modules), result.stderr)
        self.assertTrue((sources / "@sinclair/typebox").is_dir())

    def test_cleanup_failure_is_reported(self):
        self.write_manifest()
        module = self.package_dir / "node_modules/@sinclair/typebox"
        module.parent.mkdir(parents=True)
        module.write_text("not a package directory")
        result = self.run_repair()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(module), result.stderr)
        self.assertTrue(module.is_file())

    def test_is_idempotent_and_does_not_rewrite_a_repaired_manifest(self):
        self.write_manifest()
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        content = self.manifest_path.read_bytes()
        modified = self.manifest_path.stat().st_mtime_ns
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.manifest_path.read_bytes(), content)
        self.assertEqual(self.manifest_path.stat().st_mtime_ns, modified)

    def test_skips_an_uninstalled_package_without_creating_directories(self):
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("not installed", result.stdout)
        self.assertFalse(self.agent_dir.exists())

    def test_invalid_manifest_fails_before_mutation(self):
        for content in (
            "{",
            "[]",
            '{"name":"other-package"}',
            '{"name":"lsp-pi","dependencies":[]}',
            '{"name":"lsp-pi","peerDependencies":[]}',
        ):
            with self.subTest(content=content):
                self.package_dir.mkdir(parents=True, exist_ok=True)
                self.manifest_path.write_text(content)
                module = self.package_dir / "node_modules/@sinclair/typebox"
                module.mkdir(parents=True, exist_ok=True)
                result = self.run_repair()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(str(self.manifest_path), result.stderr)
                self.assertEqual(self.manifest_path.read_text(), content)
                self.assertTrue(module.is_dir())

    def test_does_not_add_unused_host_packages(self):
        self.manifest = {"name": "lsp-pi", "dependencies": {"zod": "^4.1.12"}}
        self.write_manifest()
        content = self.manifest_path.read_bytes()
        result = self.run_repair()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.manifest_path.read_bytes(), content)

    def test_apply_repairs_the_configured_agent_before_building_the_cache(self):
        self.write_manifest()
        deploy_client_runtime(self.home)
        checkout = self.home / "checkout"
        scripts = checkout / "scripts"
        (scripts / "lib").mkdir(parents=True)
        (checkout / "mise.toml").write_text("")
        shutil.copy(ROOT / "scripts/apply.sh", scripts / "apply.sh")
        shutil.copy(ROOT / "scripts/lib/runtime.sh", scripts / "lib/runtime.sh")
        shutil.copy(REPAIR, scripts / REPAIR.name)
        (scripts / "build-zsh-init-cache.sh").write_text(
            "python3 - \"$PI_CODING_AGENT_DIR\" <<'PY'\n"
            "import json, pathlib, sys\n"
            f"path = pathlib.Path(sys.argv[1]) / {str(PACKAGE_PATH)!r} / 'package.json'\n"
            "manifest = json.loads(path.read_text())\n"
            "assert '@sinclair/typebox' not in manifest['dependencies']\n"
            "assert manifest['peerDependencies']['@sinclair/typebox'] == '*'\n"
            "PY\n"
        )
        fake_bin = self.home / "bin"
        fake_bin.mkdir()
        for command in ("chezmoi", "mise"):
            stub = fake_bin / command
            stub.write_text("#!/bin/sh\nexit 0\n")
            stub.chmod(0o755)
        result = subprocess.run(
            ["bash", str(scripts / "apply.sh")],
            env={
                **os.environ,
                "HOME": str(self.home),
                "DOTFILES_ROOT": str(checkout),
                "PI_CODING_AGENT_DIR": str(self.agent_dir),
                "NEW_RELIC_LICENSE_KEY": "test-license-key",
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
            },
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
