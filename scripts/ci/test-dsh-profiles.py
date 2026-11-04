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
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "dot_local/bin/executable_dsh-profile"
SETUP = ROOT / "scripts/configure-dsh.sh"
CHEZMOI = shutil.which("chezmoi")


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
        self.env.update(
            XDG_CONFIG_HOME=str(self.home / ".config"),
            XDG_CACHE_HOME=str(self.home / ".cache"),
            XDG_DATA_HOME=str(self.home / ".local/share"),
        )
        self.runtime = self.home / ".config/dotfiles/client-runtime.sh"
        self.runtime.parent.mkdir(parents=True)
        self.runtime.write_text("DOTFILES_DSH_WORK_ENABLED=true\n")
        self.platform("Darwin")
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

    def platform(self, name):
        uname = self.bin / "uname"
        uname.write_text(f"#!/bin/sh\nprintf '%s\\n' {name}\n")
        uname.chmod(0o755)

    def chezmoi(self, *args, data=None, source=ROOT):
        return subprocess.run(
            [CHEZMOI, "--source", str(source),
             "--config", str(self.home / ".config/chezmoi/chezmoi.toml"),
             "--destination", str(self.home),
             "--cache", str(self.home / ".cache/chezmoi"),
             "--persistent-state", str(self.home / ".local/share/chezmoi/state.boltdb"),
             "--override-data", json.dumps(data or {}), *args],
            env=dict(self.env, PATH=os.environ["PATH"]),
            capture_output=True, text=True, check=False,
        )

    def render(self, path, data=None):
        result = self.chezmoi("execute-template", "--file", str(ROOT / path), data=data)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def render_yaml(self, path):
        return json.loads(subprocess.check_output(
            ["yq", "-o=json", "."], input=self.render(path), text=True,
        ))

    def setup_profiles(self):
        return subprocess.run(
            ["bash", str(SETUP)], cwd=self.repo, env=self.env,
            capture_output=True, text=True, check=False,
        )

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

    def init_source(self):
        source = self.root / "source"
        source.mkdir()
        shutil.copy(ROOT / ".chezmoi.toml.tmpl", source)
        shutil.copytree(ROOT / ".chezmoitemplates", source / ".chezmoitemplates")
        (source / "dot_apply-marker").write_text("applied")
        subprocess.run(["git", "init", "-q", str(source)], check=True)
        return source

    def write_host_config(self, source, enabled):
        config = self.home / ".config/chezmoi/chezmoi.toml"
        config.parent.mkdir(parents=True, exist_ok=True)
        value = json.dumps(enabled)
        config.write_text(f'sourceDir = {json.dumps(str(source))}\n[data]\ndsh_work_enabled = {value}\n')

    def deployment_source(self):
        source = self.init_source()
        for name in (".chezmoiignore", ".chezmoidata.toml", "mise.toml"):
            shutil.copy(ROOT / name, source)
        shutil.copytree(ROOT / "dot_dsh", source / "dot_dsh")
        for role in ("personal", "work"):
            bundle = Path(f"dot_config/deepseek-harness/{role}")
            (source / bundle).mkdir(parents=True)
            shutil.copy(ROOT / bundle / "package.json", source / bundle)
        runtime = Path("dot_config/dotfiles/client-runtime.sh.tmpl")
        (source / runtime).parent.mkdir(parents=True)
        shutil.copy(ROOT / runtime, source / runtime)
        return source

    def test_apply_gates_work_files_without_removing_installed_state(self):
        source = self.deployment_source()
        host = {"chezmoi": {"os": "darwin"}}
        result = self.chezmoi("init", "--no-tty", source=source, data=host)
        self.assertEqual(result.returncode, 0, result.stderr)
        result = self.chezmoi("apply", "--force", source=source, data=host)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.home / ".config/deepseek-harness/work").exists())
        for surface in ("tui", "web"):
            self.assertEqual((self.home / f".dsh/work/profiles/{surface}/package.json").read_text(), "{}")
            package = self.home / f".dsh/personal/profiles/{surface}/package.json"
            self.assertIs(json.loads(package.read_text())["private"], True)
        self.write_host_config(source, True)
        result = self.chezmoi("apply", "--force", source=source, data=host)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / ".config/deepseek-harness/work/package.json").is_file())
        for path in ("auth.json", "sessions/sentinel", "workspaces/sentinel"):
            marker = self.home / ".dsh/work" / path
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text("preserve")
        work_dirs = (self.home / ".dsh/work", self.home / ".config/deepseek-harness/work")
        before = {path: path.read_bytes() for directory in work_dirs for path in directory.rglob("*") if path.is_file()}
        self.write_host_config(source, False)
        result = self.chezmoi("apply", "--force", source=source, data=host)
        self.assertEqual(result.returncode, 0, result.stderr)
        after = {path: path.read_bytes() for directory in work_dirs for path in directory.rglob("*") if path.is_file()}
        self.assertEqual(before, after)
        self.assertNotEqual(self.launch("work", "web").returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_invalid_persisted_data_stops_apply_and_preserves_config(self):
        source = self.deployment_source()
        config = self.home / ".config/chezmoi/chezmoi.toml"
        config.parent.mkdir(parents=True)
        for system, value in (("darwin", '"false"'), ("linux", "true")):
            with self.subTest(system=system, value=value):
                original = f'sourceDir = {json.dumps(str(source))}\n[data]\ndsh_work_enabled = {value}\n'
                config.write_text(original)
                commands = ["apply"]
                if system == ("darwin" if sys.platform == "darwin" else "linux"):
                    commands.append("init")
                for command in commands:
                    result = self.chezmoi(command, "--force", "--no-tty", source=source,
                                          data={"chezmoi": {"os": system}})
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("dsh_work_enabled", result.stderr)
                    self.assertFalse((self.home / ".apply-marker").exists())
                    self.assertEqual(config.read_text(), original)

    def test_disabled_host_matrix_renders_personal_only(self):
        for system, release in (("darwin", ""), ("linux", "generic"),
                                ("linux", "microsoft-standard-WSL2")):
            for enabled in ({}, {"dsh_work_enabled": False}):
                with self.subTest(system=system, release=release, enabled=enabled):
                    data = dict(enabled, chezmoi={"os": system, "kernel": {"osrelease": release}})
                    config = tomllib.loads(self.render(".chezmoi.toml.tmpl", data))
                    self.assertIs(config.get("data", {}).get("dsh_work_enabled"), False)
                    ignored = self.render(".chezmoiignore", data).splitlines()
                    self.assertIn(".dsh/work", ignored)
                    self.assertIn(".config/deepseek-harness/work", ignored)
                    self.assertNotIn(".dsh/personal", ignored)
                    self.assertNotIn(".config/deepseek-harness/personal", ignored)
                    runtime = self.render("dot_config/dotfiles/client-runtime.sh.tmpl", data)
                    self.runtime.write_text(runtime)
                    self.platform("Darwin" if system == "darwin" else "Linux")
                    result = self.setup_profiles()
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual([call["env"]["DSH_HOME"] for call in self.calls()],
                                     [str(self.home / ".dsh/personal")] * 2)
                    self.assertEqual([call["args"] for call in self.calls()],
                                     [["plugin", "--profile", surface, "install"] for surface in ("tui", "web")])
                    self.log.unlink()
                    for args in (("--new",), ("web",), ("--help",)):
                        self.assertEqual(self.launch("personal", *args).returncode, 0)
                    self.log.unlink()

    def test_opted_in_mac_keeps_both_roles(self):
        data = {"dsh_work_enabled": True, "chezmoi": {"os": "darwin"}}
        config = tomllib.loads(self.render(".chezmoi.toml.tmpl", data))
        self.assertIs(config.get("data", {}).get("dsh_work_enabled"), True)
        ignored = self.render(".chezmoiignore", data).splitlines()
        for role in ("personal", "work"):
            self.assertNotIn(f".dsh/{role}", ignored)
            self.assertNotIn(f".config/deepseek-harness/{role}", ignored)
        self.runtime.write_text(self.render("dot_config/dotfiles/client-runtime.sh.tmpl", data))
        result = self.setup_profiles()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["env"]["DSH_HOME"] for call in self.calls()],
                         [str(self.home / f".dsh/{role}") for role in ("personal", "work") for _ in ("tui", "web")])

    def test_invalid_data_fails_all_consuming_templates(self):
        invalid = [("darwin", value) for value in ("true", "false", "", 0, 1, [], {}, None)]
        invalid += [("linux", True)]
        for system, value in invalid:
            for path in (".chezmoi.toml.tmpl", ".chezmoiignore", "dot_config/dotfiles/client-runtime.sh.tmpl"):
                with self.subTest(system=system, value=value, path=path):
                    result = self.chezmoi("execute-template", "--file", str(ROOT / path),
                                          data={"dsh_work_enabled": value, "chezmoi": {"os": system}})
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("dsh_work_enabled", result.stderr)

    def test_init_preserves_local_opt_in_idempotently(self):
        source = self.init_source()
        values = [None, False, False]
        if sys.platform == "darwin":
            values += [True, True, False]
        for enabled in values:
            with self.subTest(enabled=enabled):
                if enabled is not None:
                    self.write_host_config(source, enabled)
                for _ in range(2):
                    result = self.chezmoi("init", "--no-tty", source=source)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    config = tomllib.loads((self.home / ".config/chezmoi/chezmoi.toml").read_text())
                    self.assertIs(config["data"]["dsh_work_enabled"], bool(enabled))
                    self.assertFalse((self.home / ".apply-marker").exists())

    def test_invalid_init_stops_before_apply(self):
        source = self.init_source()
        self.write_host_config(source, "false")
        result = self.chezmoi("init", "--apply", "--force", "--no-tty", source=source)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("dsh_work_enabled", result.stderr)
        self.assertFalse((self.home / ".apply-marker").exists())

    def test_disabled_or_unavailable_config_blocks_existing_work_before_credentials(self):
        self.origin("https://github.com/jobtalk/example.git")
        self.env.pop("DSH_NEW_RELIC_API_KEY")
        self.env["DOTFILES_DSH_WORK_ENABLED"] = "true"
        op = self.bin / "op"
        op.write_text('#!/bin/sh\nprintf called > "$HOME/op-called"\nexit 1\n')
        op.chmod(0o755)
        markers = []
        for path in ("auth.json", "sessions/sentinel", "workspaces/sentinel"):
            marker = self.home / ".dsh/work" / path
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text("preserve")
            markers.append(marker)
        for content in (None, "", "DOTFILES_DSH_WORK_ENABLED=false\n",
                        "DOTFILES_DSH_WORK_ENABLED=invalid\n", "DOTFILES_DSH_WORK_ENABLED=true\nreturn 19\n",
                        "false\nDOTFILES_DSH_WORK_ENABLED=true\n"):
            with self.subTest(content=content):
                if content is None:
                    self.runtime.unlink()
                else:
                    self.runtime.write_text(content)
                for key in (None, "provided-key"):
                    if key is None:
                        self.env.pop("DSH_NEW_RELIC_API_KEY", None)
                    else:
                        self.env["DSH_NEW_RELIC_API_KEY"] = key
                    for args in ((), ("web",), ("--help",), ("list-models",)):
                        result = self.launch("work", *args)
                        self.assertNotEqual(result.returncode, 0)
                        if content in (None, "", "DOTFILES_DSH_WORK_ENABLED=false\n",
                                       "DOTFILES_DSH_WORK_ENABLED=invalid\n"):
                            self.assertIn("Work Harness", result.stderr)
                self.assertEqual(self.calls(), [])
                self.assertFalse((self.home / "op-called").exists())
                for marker in markers:
                    self.assertEqual(marker.read_text(), "preserve")

    def test_setup_rejects_missing_or_invalid_config_before_install(self):
        self.env["DOTFILES_DSH_WORK_ENABLED"] = "true"
        for content in (None, "", "DOTFILES_DSH_WORK_ENABLED=invalid\n",
                        "DOTFILES_DSH_WORK_ENABLED=true\nreturn 19\n"):
            with self.subTest(content=content):
                if content is None:
                    self.runtime.unlink()
                else:
                    self.runtime.write_text(content)
                self.assertNotEqual(self.setup_profiles().returncode, 0)
                self.assertEqual(self.calls(), [])

    def test_non_darwin_refuses_enabled_work_before_credentials_or_install(self):
        self.platform("Linux")
        self.origin("https://github.com/jobtalk/example.git")
        self.env.pop("DSH_NEW_RELIC_API_KEY")
        op = self.bin / "op"
        op.write_text('#!/bin/sh\nprintf called > "$HOME/op-called"\nexit 1\n')
        op.chmod(0o755)
        for args in ((), ("web",), ("--help",)):
            result = self.launch("work", *args)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Darwin", result.stderr)
        self.assertNotEqual(self.setup_profiles().returncode, 0)
        self.assertEqual(self.calls(), [])
        self.assertFalse((self.home / "op-called").exists())

    def test_personal_help_and_login_do_not_require_work_config(self):
        self.runtime.unlink()
        self.env.pop("DSH_NEW_RELIC_API_KEY")
        login = self.home / ".dsh/personal/profiles/tui/node_modules/.bin/dsh-provider-extra-login"
        shutil.copy(self.bin / "dsh", login)
        for args in (("--help",), ("personal", "--help"), ("personal", "login")):
            result = self.launch(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.calls()), 2)

    def test_setup_preflights_all_enabled_manifests(self):
        (self.home / ".dsh/work/profiles/web/package.json").unlink()
        result = self.setup_profiles()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

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
        config.parent.mkdir(parents=True, exist_ok=True)
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
        config.parent.mkdir(parents=True, exist_ok=True)
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
        ollama = []
        for role in ("personal", "work"):
            bundle = ROOT / f"dot_config/deepseek-harness/{role}"
            manifest = json.loads(self.render(bundle / "package.json"))
            self.assertEqual(manifest["dsh"]["bundle"]["patch"], "./cordis.patch.yml")
            rows = {row["id"]: row for row in self.render_yaml(bundle / "cordis.patch.yml") if "id" in row}
            providers = rows["llm-pi-ai"]["config"]["providers"]
            self.assertEqual(set(providers), {"ollama", "openai-codex"} if role == "personal" else {"ollama"})
            self.assertEqual(providers["ollama"]["baseURL"], "http://127.0.0.1:11434/v1")
            self.assertEqual(providers["ollama"]["apiKeyEnv"], "DSH_OLLAMA_API_KEY")
            ollama.append(providers["ollama"])
            default = rows["agent-default-model"]["config"]
            self.assertEqual(default["provider"], "openai-codex" if role == "personal" else "ollama")
            if role == "personal":
                for plugin in ("subagent-claude-code", "tool-subagent-claude-code"):
                    self.assertIs(rows[plugin]["disabled"], True)
            else:
                self.assertIn(default["model"], [model["id"] for model in providers["ollama"]["models"]])
                self.assertEqual(rows["subagent-claude-code"]["config"]["permissionMode"], "dontAsk")
            profile = json.loads(self.render(f"dot_dsh/{role}/profiles/tui/package.json.tmpl"))
            bundles = profile["dsh"]["profile"]["bundles"]
            self.assertNotIn("@deepseek-ai/dsh-subagent-codex", bundles)
            self.assertNotIn("@sagmans/dsh-provider-extra", bundles)
            self.assertEqual("@deepseek-ai/dsh-subagent-claude-code" in bundles, role == "work")
            for version in profile["dependencies"].values():
                if not version.startswith("link:"):
                    self.assertNotIn("^", version)
                    self.assertNotIn("latest", version)
        self.assertEqual(ollama[0], ollama[1])

    def test_ollama_profiles_reserve_output_within_the_local_context(self):
        for role in ("personal", "work"):
            with self.subTest(role=role):
                patch = self.render_yaml(f"dot_config/deepseek-harness/{role}/cordis.patch.yml")
                rows = {row["id"]: row for row in patch if "id" in row}
                models = rows["llm-pi-ai"]["config"]["providers"]["ollama"]["models"]
                self.assertTrue(models)
                self.assertEqual(len(models), len({model["id"] for model in models}))
                policies = rows["compaction-basic"]["config"]["modelPolicies"]
                self.assertEqual({policy["provider"] for policy in policies}, {"ollama"})
                self.assertEqual([policy["model"] for policy in policies], [model["id"] for model in models])
                for model, policy in zip(models, policies):
                    self.assertGreater(model["maxTokens"], 0)
                    self.assertLess(model["maxTokens"], model["contextWindow"])
                    self.assertGreater(policy["maxTokens"], 0)
                    self.assertGreater(policy["headroomTokens"], 0)
                    self.assertLessEqual(policy["maxTokens"], model["maxTokens"])
                    self.assertLess(model["maxTokens"] + policy["headroomTokens"], model["contextWindow"])

    def test_web_manifests_mount_only_the_matching_role_and_browser_surface(self):
        for role in ("personal", "work"):
            profile = json.loads(self.render(f"dot_dsh/{role}/profiles/web/package.json.tmpl"))
            bundles = profile["dsh"]["profile"]["bundles"]
            self.assertIn("@deepseek-ai/dsh-web-app", bundles)
            self.assertIn(f"@dotfiles/dsh-{role}", bundles)
            self.assertNotIn("@sagmans/dsh-tui", bundles)
            self.assertEqual("@deepseek-ai/dsh-subagent-claude-code" in bundles, role == "work")

    def test_profiles_and_patch_targets_follow_the_mise_dsh_version(self):
        canonical = tomllib.loads((ROOT / "mise.toml").read_text())["tools"]["npm:@deepseek-ai/dsh"]["version"]
        for role in ("personal", "work"):
            for surface in ("tui", "web"):
                with self.subTest(role=role, surface=surface):
                    profile = ROOT / f"dot_dsh/{role}/profiles/{surface}"
                    package = json.loads(self.render(profile / "package.json.tmpl"))
                    self.assertEqual(package["dependencies"]["@deepseek-ai/dsh"], canonical)
                    workspace = self.render_yaml(profile / "pnpm-workspace.yaml.tmpl")
                    expected = {}
                    if role == "personal":
                        expected[f"@deepseek-ai/dsh-experimental-auto-review@{canonical}"] = "dsh-auto-review.patch"
                    if surface == "tui":
                        expected[f"@deepseek-ai/dsh@{canonical}"] = "dsh-shutdown.patch"
                    patches = workspace.get("patchedDependencies", {})
                    self.assertEqual(set(patches), set(expected))
                    for dependency, name in expected.items():
                        path = (profile / patches[dependency]).resolve()
                        self.assertEqual(path, ROOT / "dot_dsh/patches" / name)
                        self.assertTrue(path.is_file())

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
