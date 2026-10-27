#!/usr/bin/env python3
"""Behavior tests for isolated DeepSeek Harness launchers and profile setup."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "dot_local/bin/executable_dsh-profile"
SETUP = ROOT / "scripts/configure-dsh.sh"


class DshProfilesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.bin = self.root / "bin"
        self.repo = self.root / "repository"
        self.home.mkdir()
        self.bin.mkdir()
        self.repo.mkdir()
        self.log = self.root / "calls.jsonl"
        self.env = dict(
            os.environ, HOME=str(self.home), PATH=f"{self.bin}:/usr/bin:/bin"
        )
        self.env["DSH_TEST_LOG"] = str(self.log)
        self.env["DSH_NEW_RELIC_API_KEY"] = "test-new-relic-key"
        self.env.pop("DSH_NEW_RELIC_ENABLE", None)
        self.env.pop("NEW_RELIC_LICENSE_KEY", None)
        stub = self.bin / "dsh"
        stub.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "with open(os.environ['DSH_TEST_LOG'], 'a') as stream:\n"
            "    stream.write(json.dumps({'args': sys.argv[1:], 'env': dict(os.environ)}) + '\\n')\n"
            "sys.exit(int(os.environ.get('DSH_TEST_EXIT', '0')))\n"
        )
        stub.chmod(0o755)
        for role in ("personal", "work"):
            for surface in ("tui", "web"):
                profile = self.home / f".dsh/{role}/profiles/{surface}"
                (profile / "node_modules/.bin").mkdir(parents=True)
                shutil.copy(stub, profile / "node_modules/.bin/dsh")
                (profile / "package.json").write_text("{}")
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)

    def origin(self, url):
        subprocess.run(
            ["git", "-C", str(self.repo), "config", "remote.origin.url", url],
            check=True,
        )

    def launch(self, *args, cwd=None):
        return subprocess.run(
            ["bash", str(LAUNCHER), *args],
            cwd=cwd or self.repo,
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )

    def calls(self):
        return (
            [json.loads(line) for line in self.log.read_text().splitlines()]
            if self.log.exists()
            else []
        )

    def test_personal_defaults_to_tui_with_direct_codex_home(self):
        self.env.update(
            DSH_HOME="/wrong/home",
            ANTHROPIC_API_KEY="company-key",
            CLAUDE_CODE_OAUTH_TOKEN="company-token",
            OPENAI_API_KEY="other-key",
        )
        result = self.launch(
            "personal", "--resume", "session-one", "--preset", "standard"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        (call,) = self.calls()
        self.assertEqual(
            call["args"],
            [
                "--profile",
                "tui",
                "--resume",
                "session-one",
                "--preset",
                "standard",
            ],
        )
        self.assertEqual(call["env"]["DSH_HOME"], str(self.home / ".dsh/personal"))
        self.assertEqual(call["env"]["DSH_OLLAMA_API_KEY"], "ollama")
        for name in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY"):
            self.assertNotIn(name, call["env"])

    def test_web_uses_the_same_role_home_with_separate_loopback_ports(self):
        for role, port in (("personal", "3080"), ("work", "3081")):
            with self.subTest(role=role):
                self.origin(f"https://github.com/{'kqnade' if role == 'personal' else 'jobtalk'}/example.git")
                result = self.launch(role, "web", "--no-open")
                self.assertEqual(result.returncode, 0, result.stderr)
                call = self.calls()[-1]
                expected = ["--profile", "web"]
                if role == "work":
                    expected += ["--patch", str(self.home / ".config/deepseek-harness/work/web-required.patch.yml")]
                self.assertEqual(call["args"], expected + ["--host", "127.0.0.1", "--port", port, "--no-open"])
                self.assertEqual(call["env"]["DSH_HOME"], str(self.home / f".dsh/{role}"))
                self.assertEqual(call["env"]["DSH_NEW_RELIC_ENABLE"], "1")
                self.assertEqual(call["env"]["DSH_NEW_RELIC_API_KEY"], "test-new-relic-key")

    @unittest.skipUnless(os.environ.get("DSH_TEST_CLI"), "requires installed DSH CLI")
    def test_real_cli_consumes_guard_overlay_before_web_arguments(self):
        result = self.launch("work", "web", "--no-open", cwd=self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        (call,) = self.calls()
        # Dump mode reports forwarded app arguments without loading a profile or starting Web.
        parsed = subprocess.run(
            [os.environ["DSH_TEST_CLI"], "--dump-config", *call["args"]],
            cwd=self.root, env=dict(call["env"], PATH=os.environ["PATH"]),
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(parsed.returncode, 1, parsed.stderr)
        self.assertIn("config dumps take no app arguments", parsed.stderr)
        self.assertIn('"--host"', parsed.stderr)
        self.assertNotIn('"--patch"', parsed.stderr)
        self.assertNotIn("web-required.patch.yml", parsed.stderr)

    def test_web_rejects_bind_and_composition_overrides(self):
        for args in (("--host", "0.0.0.0"), ("--port", "3081"), ("--public-url", "https://example.com"),
                     ("--trusted-host", "example.com"), ("--profile", "tui"), ("--patch", "/tmp/other.yml"), ("login",)):
            with self.subTest(args=args):
                result = self.launch("personal", "web", *args)
                self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_personal_web_checks_repository_scope_before_starting(self):
        self.origin("https://github.com/jobtalk/example.git")
        personal = self.launch("personal", "web")
        self.assertEqual(personal.returncode, 2)
        self.assertIn("Use dsh work", personal.stderr)
        self.assertEqual(self.calls(), [])

    def test_work_web_starts_outside_company_repositories(self):
        self.origin("https://github.com/kqnade/example.git")
        for cwd in (self.repo, self.root):
            with self.subTest(cwd=cwd):
                result = self.launch("work", "web", cwd=cwd)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.calls()[-1]["env"]["DSH_HOME"], str(self.home / ".dsh/work"))

    def test_web_requires_its_own_runtime_installation(self):
        shutil.rmtree(self.home / ".dsh/personal/profiles/web/node_modules")
        result = self.launch("personal", "web")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mise run dsh-setup", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_personal_enables_telemetry_with_explicit_key(self):
        result = self.launch("personal")
        self.assertEqual(result.returncode, 0, result.stderr)
        env = self.calls()[0]["env"]
        self.assertEqual(env["DSH_NEW_RELIC_ENABLE"], "1")
        self.assertEqual(env["DSH_NEW_RELIC_API_KEY"], "test-new-relic-key")

    def test_opt_out_and_help_do_not_pass_telemetry_key(self):
        for role in ("personal", "work"):
            self.origin(f"https://github.com/{'kqnade' if role == 'personal' else 'jobtalk'}/example.git")
            for value, args in (("off", ()), ("FALSE", ()), ("0", ()), ("1", ("--help",)), ("1", ("list-models",))):
                with self.subTest(role=role, value=value, args=args):
                    self.env["DSH_NEW_RELIC_ENABLE"] = value
                    result = self.launch(role, *args)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(self.calls()[-1]["env"]["DSH_NEW_RELIC_ENABLE"], "0")
                    self.assertNotIn("DSH_NEW_RELIC_API_KEY", self.calls()[-1]["env"])

    def test_work_enables_telemetry_by_default(self):
        self.origin("https://github.com/jobtalk/example.git")
        result = self.launch("work")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls()[0]["env"]["DSH_NEW_RELIC_ENABLE"], "1")
        self.assertEqual(self.calls()[0]["env"]["DSH_NEW_RELIC_API_KEY"], "test-new-relic-key")

    def test_telemetry_key_lookup_failure_stops_launch(self):
        self.env.pop("DSH_NEW_RELIC_API_KEY")
        config = self.home / ".config/dotfiles/client-runtime.sh"
        config.parent.mkdir(parents=True)
        config.write_text("DOTFILES_OP_NEW_RELIC_REF=op://test/new-relic/key\n")
        op = self.bin / "op"
        op.write_text("#!/bin/sh\nexit 1\n")
        op.chmod(0o755)
        result = self.launch("personal")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("New Relic", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_telemetry_reads_managed_key_after_authorization(self):
        self.env.pop("DSH_NEW_RELIC_API_KEY")
        config = self.home / ".config/dotfiles/client-runtime.sh"
        config.parent.mkdir(parents=True)
        config.write_text("DOTFILES_OP_NEW_RELIC_REF=op://test/new-relic/key\n")
        op = self.bin / "op"
        op.write_text('#!/bin/sh\n[ "$1" = read ] && [ "$2" = op://test/new-relic/key ] || exit 2\nprintf test-key\n')
        op.chmod(0o755)
        result = self.launch("personal")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls()[0]["env"]["DSH_NEW_RELIC_API_KEY"], "test-key")
        self.origin("https://github.com/jobtalk/example.git")
        op.write_text('#!/bin/sh\nprintf called > "$HOME/op-called"\nexit 1\n')
        result = self.launch("personal")
        self.assertEqual(result.returncode, 2)
        self.assertFalse((self.home / "op-called").exists())

    def test_work_starts_only_in_known_work_origins(self):
        for url in (
            "git@github.com:livesense-inc/example.git",
            "https://github.com/jobtalk/example.git",
        ):
            with self.subTest(url=url):
                self.origin(url)
                result = self.launch("work", "--new")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(
                    self.calls()[-1]["env"]["DSH_HOME"], str(self.home / ".dsh/work")
                )

    def test_personal_refuses_work_before_starting_or_creating_state(self):
        for url in (
            "git@github.com:livesense-inc/example.git",
            "ssh://git@github.com:22/jobtalk/example.git",
            "https://user@github.com/Jobtalk/example.git/",
        ):
            with self.subTest(url=url):
                self.origin(url)
                result = self.launch("personal", "--help")
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn("work", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_work_refuses_personal_missing_and_unknown_origins(self):
        for url in (
            None,
            "https://github.com/kqnade/example.git",
            "git@alias:jobtalk/example.git",
            "https://github.com/jobtalk/example/extra.git",
        ):
            with self.subTest(url=url):
                if url:
                    self.origin(url)
                result = self.launch("work")
                self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(self.calls(), [])

    def test_rewritten_and_multiple_origins_cannot_cross_roles(self):
        subprocess.run(
            [
                "git",
                "-C",
                str(self.repo),
                "config",
                "url.https://github.com/jobtalk/.insteadOf",
                "work:",
            ],
            check=True,
        )
        self.origin("work:example.git")
        self.assertEqual(self.launch("personal").returncode, 2)
        self.assertEqual(self.launch("work").returncode, 0)
        subprocess.run(
            [
                "git",
                "-C",
                str(self.repo),
                "config",
                "--add",
                "remote.origin.url",
                "https://github.com/kqnade/example.git",
            ],
            check=True,
        )
        self.assertEqual(self.launch("work").returncode, 2)
        self.assertEqual(self.launch("personal").returncode, 2)
        self.assertEqual(len(self.calls()), 1)

    def test_git_read_failures_fail_closed(self):
        git = self.bin / "git"
        git.write_text("#!/bin/sh\nexit 128\n")
        git.chmod(0o755)
        result = self.launch("personal")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_missing_dependencies_explain_setup_and_preserve_exit_status(self):
        shutil.rmtree(self.home / ".dsh/personal/profiles/tui/node_modules")
        result = self.launch("personal")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mise run dsh-setup", result.stderr)
        self.assertEqual(self.calls(), [])
        installed_bin = self.home / ".dsh/personal/profiles/tui/node_modules/.bin"
        installed_bin.mkdir(parents=True)
        shutil.copy(self.bin / "dsh", installed_bin / "dsh")
        self.env["DSH_TEST_EXIT"] = "17"
        self.assertEqual(self.launch("personal").returncode, 17)

    def test_launcher_rejects_profile_and_patch_escape_hatches(self):
        for args in (
            ("--profile", "web"),
            ("--profile=web",),
            ("--patch", "/tmp/other.yml"),
            ("--from-default-profile", "web"),
            ("--provider", "anthropic"),
            ("--model", "anthropic/claude"),
            ("plugin", "install"),
            ("--cwd", "/tmp"),
        ):
            with self.subTest(args=args):
                result = self.launch("personal", *args)
                self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_model_flags_require_the_tui_model_command(self):
        result = self.launch("personal", "--provider", "ollama", "--model", "qwen3.8:27b-mlx")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("/model", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_zsh_entry_points_do_not_change_the_calling_shell(self):
        launcher = self.home / ".local/bin/dsh-profile"
        launcher.parent.mkdir(parents=True)
        shutil.copy(LAUNCHER, launcher)
        launcher.chmod(0o755)
        result = subprocess.run(
            [
                "zsh",
                "-dfc",
                f'source "{ROOT}/dot_config/zsh/functions/dsh.zsh"; dsh personal --new; dsh-personal list-models; [[ -z $DSH_HOME ]]',
            ],
            cwd=self.repo,
            env={k: v for k, v in self.env.items() if k != "DSH_HOME"},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.calls()), 2)

    def test_setup_installs_both_homes_without_launching_an_agent(self):
        result = subprocess.run(
            ["bash", str(SETUP)],
            cwd=self.repo,
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            [call["args"] for call in self.calls()],
            [["plugin", "--profile", surface, "install"] for _ in ("personal", "work") for surface in ("tui", "web")],
        )
        self.assertEqual(
            [call["env"]["DSH_HOME"] for call in self.calls()],
            [str(self.home / f".dsh/{role}") for role in ("personal", "work") for _ in ("tui", "web")],
        )

    def test_codex_login_is_personal_and_uses_only_the_harness_store(self):
        login = self.home / ".dsh/personal/profiles/tui/node_modules/.bin/dsh-provider-extra-login"
        login.parent.mkdir(exist_ok=True)
        shutil.copy(self.bin / "dsh", login)
        result = self.launch("personal", "login")
        self.assertEqual(result.returncode, 0, result.stderr)
        call, = self.calls()
        self.assertEqual(call["args"], [])
        self.assertEqual(call["env"]["DSH_HOME"], str(self.home / ".dsh/personal"))
        self.origin("https://github.com/jobtalk/example.git")
        self.assertNotEqual(self.launch("personal", "login").returncode, 0)
        self.assertNotEqual(self.launch("work", "login").returncode, 0)
        self.assertEqual(len(self.calls()), 1)

    def test_managed_profiles_keep_providers_and_native_subagents_separate(self):
        for role in ("personal", "work"):
            bundle = ROOT / f"dot_config/deepseek-harness/{role}"
            manifest = json.loads((bundle / "package.json").read_text())
            self.assertEqual(manifest["dsh"]["bundle"]["patch"], "./cordis.patch.yml")
            result = subprocess.run(["yq", "-o=json", ".", str(bundle / "cordis.patch.yml")],
                                    capture_output=True, text=True, check=True)
            rows = {row["id"]: row for row in json.loads(result.stdout) if "id" in row}
            providers = rows["llm-pi-ai"]["config"]["providers"]
            self.assertEqual(set(providers), {"ollama", "openai-codex"} if role == "personal" else {"ollama"})
            self.assertEqual(providers["ollama"]["baseURL"], "http://127.0.0.1:11434/v1")
            self.assertEqual(providers["ollama"]["models"][0]["id"], "qwen3.8:27b-mlx")
            template = ROOT / f"dot_dsh/{role}/profiles/tui/package.json.tmpl"
            rendered = subprocess.run(["chezmoi", "--source", str(ROOT), "execute-template"],
                                      input=template.read_text(), capture_output=True, text=True, check=True)
            profile = json.loads(rendered.stdout)
            self.assertEqual(profile["dependencies"]["@deepseek-ai/dsh"], "0.2.1-rc.2")
            bundles = profile["dsh"]["profile"]["bundles"]
            self.assertNotIn("@deepseek-ai/dsh-subagent-codex", bundles)
            self.assertNotIn("@sagmans/dsh-provider-extra", bundles)
            self.assertEqual("@deepseek-ai/dsh-subagent-claude-code" in bundles, role == "work")
            for dependency, version in profile["dependencies"].items():
                if not version.startswith("link:"):
                    self.assertNotIn("^", version)
                    self.assertNotIn("latest", version)

    def test_web_manifests_mount_only_the_matching_role_and_browser_surface(self):
        for role in ("personal", "work"):
            template = ROOT / f"dot_dsh/{role}/profiles/web/package.json.tmpl"
            rendered = subprocess.run(["chezmoi", "--source", str(ROOT), "execute-template"],
                                      input=template.read_text(), capture_output=True, text=True, check=True)
            profile = json.loads(rendered.stdout)
            self.assertEqual(profile["dependencies"]["@deepseek-ai/dsh"], "0.2.1-rc.2")
            bundles = profile["dsh"]["profile"]["bundles"]
            self.assertIn("@deepseek-ai/dsh-web-app", bundles)
            self.assertIn(f"@dotfiles/dsh-{role}", bundles)
            self.assertNotIn("@sagmans/dsh-tui", bundles)
            self.assertEqual("@deepseek-ai/dsh-subagent-claude-code" in bundles, role == "work")

    def test_tui_profiles_patch_the_pinned_launcher_shutdown(self):
        for role in ("personal", "work"):
            profile = ROOT / f"dot_dsh/{role}/profiles/tui"
            result = subprocess.run(
                ["yq", "-o=json", ".", str(profile / "pnpm-workspace.yaml")],
                capture_output=True, text=True, check=True,
            )
            patches = json.loads(result.stdout)["patchedDependencies"]
            expected = {"@deepseek-ai/dsh@0.2.1-rc.2"}
            if role == "personal":
                expected.add("@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2")
            self.assertEqual(set(patches), expected)
            patch = (profile / patches["@deepseek-ai/dsh@0.2.1-rc.2"]).resolve()
            self.assertEqual(patch, ROOT / "dot_dsh/patches/dsh-shutdown.patch")
            self.assertTrue(patch.is_file())

    def test_personal_profiles_patch_codex_auto_review(self):
        for surface in ("tui", "web"):
            profile = ROOT / f"dot_dsh/personal/profiles/{surface}"
            result = subprocess.run(
                ["yq", "-o=json", ".", str(profile / "pnpm-workspace.yaml")],
                capture_output=True, text=True, check=True,
            )
            patches = json.loads(result.stdout)["patchedDependencies"]
            patch = (profile / patches["@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2"]).resolve()
            self.assertEqual(patch, ROOT / "dot_dsh/patches/dsh-auto-review.patch")
            self.assertTrue(patch.is_file())

    def test_setup_stops_on_install_failure(self):
        self.env["DSH_TEST_EXIT"] = "13"
        result = subprocess.run(
            ["bash", str(SETUP)],
            cwd=self.repo,
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 13)
        self.assertEqual(len(self.calls()), 1)


if __name__ == "__main__":
    unittest.main()
