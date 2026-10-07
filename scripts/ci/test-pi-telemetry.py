#!/usr/bin/env python3
"""Behavior tests for the guarded Pi New Relic telemetry launcher."""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import tempfile
import tomllib
import unittest

from client_runtime_fixture import deploy_client_runtime


ROOT = pathlib.Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "dot_local/bin/executable_pi-telemetry"
ZSH_FUNCTION = ROOT / "dot_config/zsh/functions/pi.zsh"
DEFAULT_REFERENCE = tomllib.loads((ROOT / ".chezmoidata.toml").read_text())["client_runtime"]["onepassword"]["references"]["new_relic"]


class PiTelemetryLauncherTests(unittest.TestCase):
    def run_launcher(self, *, op_output=None, env_overrides=None, args=(), cwd=None, reference=None, missing_config=False):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = pathlib.Path(temporary_directory)
            overrides = {} if reference is None else {
                "client_runtime": {"onepassword": {"references": {"new_relic": reference}}},
            }
            config = deploy_client_runtime(temporary_path, overrides)
            if missing_config:
                config.unlink()
            fake_bin = temporary_path / "bin"
            fake_bin.mkdir()
            command_log = temporary_path / "commands.log"
            env_capture = temporary_path / "pi-env.json"

            fake_pi = fake_bin / "pi"
            fake_pi.write_text(
                "#!/bin/sh\n"
                'printf \'%s\\n\' "$*" >>"$PI_TEST_COMMAND_LOG"\n'
                'python3 -c \'import json, os; json.dump(dict(os.environ), open(os.environ["PI_TEST_ENV_CAPTURE"], "w"))\'\n'
            )
            fake_pi.chmod(0o755)

            fake_op = fake_bin / "op"
            fake_op.write_text(
                "#!/bin/sh\n"
                'printf \'op %s\\n\' "$*" >>"$PI_TEST_COMMAND_LOG"\n'
                'printf \'%s\\n\' "${PI_TEST_OP_OUTPUT-}"\n'
            )
            fake_op.chmod(0o755)

            env = dict(os.environ)
            for name in tuple(env):
                if name.startswith(("PI_NEW_RELIC_", "PI_OTEL_", "OTEL_", "NEW_RELIC_")) or name == "PI_CODING_AGENT_DIR":
                    env.pop(name)
            env.update(
                HOME=str(temporary_path),
                PATH=f"{fake_bin}:/usr/bin:/bin",
                PI_TEST_COMMAND_LOG=str(command_log),
                PI_TEST_ENV_CAPTURE=str(env_capture),
                PI_TEST_OP_OUTPUT=op_output or "",
            )
            if env_overrides:
                env.update(env_overrides)

            result = subprocess.run(
                ["bash", str(LAUNCHER), *args],
                cwd=cwd or temporary_path,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            captured = json.loads(env_capture.read_text()) if env_capture.exists() else None
            commands = command_log.read_text().splitlines() if command_log.exists() else []
            return result, captured, commands

    def test_uses_configured_reference_and_honors_an_explicit_override(self):
        for overrides, expected in [(None, "op://Tests/NewRelic/key"),
                                    ({"NEW_RELIC_LICENSE_KEY_OP_REF": "op://Override/NR/key"}, "op://Override/NR/key")]:
            result, captured, commands = self.run_launcher(
                op_output="test-license-key", reference="op://Tests/NewRelic/key", env_overrides=overrides,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(commands[0], f"op read {expected}")
            self.assertEqual(captured["PI_NEW_RELIC_API_KEY"], "test-license-key")

    def test_missing_configuration_or_reference_never_starts_pi(self):
        for options, message in [({"missing_config": True}, "configuration is missing"),
                                 ({"reference": ""}, "reference is missing or invalid"),
                                 ({"env_overrides": {"NEW_RELIC_LICENSE_KEY_OP_REF": ""}}, "reference is missing or invalid")]:
            result, captured, commands = self.run_launcher(op_output="unused-key", **options)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(message, result.stderr)
            self.assertIsNone(captured)
            self.assertEqual(commands, [])

    def test_loads_key_from_existing_op_reference(self):
        result, captured, commands = self.run_launcher(
            op_output="test-license-key",
            args=("--print", "hello world"),
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(commands, [
            f"op read {DEFAULT_REFERENCE}",
            "--print hello world",
        ])
        self.assertIsNotNone(captured)
        assert captured is not None
        self.assertEqual(captured["PI_NEW_RELIC_ENABLE"], "1")
        self.assertEqual(captured["PI_NEW_RELIC_API_KEY"], "test-license-key")
        self.assertNotIn("NEW_RELIC_LICENSE_KEY", captured)
        self.assertFalse(any(name.startswith(("PI_OTEL_", "OTEL_")) for name in captured))

    def test_reuses_existing_license_key_without_querying_op(self):
        result, captured, commands = self.run_launcher(
            op_output="must-not-be-used",
            env_overrides={"NEW_RELIC_LICENSE_KEY": "provided-key"},
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(commands, [""])
        self.assertIsNotNone(captured)
        assert captured is not None
        self.assertEqual(captured["PI_NEW_RELIC_API_KEY"], "provided-key")
        self.assertNotIn("NEW_RELIC_LICENSE_KEY", captured)

    def test_preserves_explicit_api_key_configuration(self):
        result, captured, commands = self.run_launcher(
            op_output="must-not-be-used",
            env_overrides={
                "PI_NEW_RELIC_ENABLE": "1",
                "PI_NEW_RELIC_API_KEY": "configured-key",
            },
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(commands, [""])
        self.assertIsNotNone(captured)
        assert captured is not None
        self.assertEqual(captured["PI_NEW_RELIC_ENABLE"], "1")
        self.assertEqual(captured["PI_NEW_RELIC_API_KEY"], "configured-key")

    def test_normalizes_positive_enable_values_for_the_extension(self):
        result, captured, commands = self.run_launcher(
            op_output="must-not-be-used",
            env_overrides={
                "PI_NEW_RELIC_ENABLE": "yes",
                "PI_NEW_RELIC_API_KEY": "configured-key",
            },
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(commands, [""])
        self.assertIsNotNone(captured)
        assert captured is not None
        self.assertEqual(captured["PI_NEW_RELIC_ENABLE"], "1")

    def test_disables_telemetry_without_querying_op(self):
        result, captured, commands = self.run_launcher(
            op_output="must-not-be-used",
            env_overrides={"PI_NEW_RELIC_ENABLE": "0"},
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(commands, [""])
        self.assertIsNotNone(captured)
        assert captured is not None
        self.assertEqual(captured["PI_NEW_RELIC_ENABLE"], "0")
        self.assertNotIn("PI_NEW_RELIC_API_KEY", captured)

    def test_bypasses_key_lookup_for_pi_help_and_management_commands(self):
        for args in (("--help",), ("install", "npm:example"), ("list",)):
            with self.subTest(args=args):
                result, captured, commands = self.run_launcher(op_output="", args=args)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(commands, [" ".join(args)])
                self.assertIsNotNone(captured)
                assert captured is not None
                self.assertNotIn("PI_NEW_RELIC_API_KEY", captured)

    def test_fails_without_key_and_does_not_start_pi(self):
        result, captured, commands = self.run_launcher(op_output="")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("New Relic license key", result.stderr)
        self.assertIsNone(captured)
        self.assertEqual(commands, [f"op read {DEFAULT_REFERENCE}"])

    def test_rejects_work_repositories_before_credentials_or_pi_start(self):
        remotes = (
            "git@github.com:livesense-inc/example.git",
            "https://github.com/jobtalk/example.git",
            "ssh://git@github.com/jobtalk/example.git",
            "https://github.com/Livesense-Inc/example.git/",
            "ssh://git@github.com:22/livesense-inc/example.git",
            "https://test-user@github.com/jobtalk/example.git",
        )
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory)
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            nested = repository / "nested"
            nested.mkdir()
            for remote in remotes:
                subprocess.run(
                    ["git", "-C", str(repository), "config", "remote.origin.url", remote],
                    check=True,
                )
                for env, args in (({}, ()), ({"PI_NEW_RELIC_ENABLE": "0"}, ()),
                                  ({}, ("--help",)), ({}, ("list",))):
                    with self.subTest(remote=remote, env=env, args=args):
                        result, captured, commands = self.run_launcher(
                            cwd=nested, op_output="must-not-be-used", env_overrides=env,
                            args=args,
                        )
                        self.assertEqual(result.returncode, 2, result.stderr)
                        self.assertIn("approved Claude account", result.stderr)
                        self.assertIsNone(captured)
                        self.assertEqual(commands, [])

    def test_allows_personal_repositories_and_repositories_without_origin(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory)
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            for remote in (None, "git@github.com:kqnade/dotfiles.git",
                           "https://github.com/jobtalk-personal/example.git",
                           "https://github.com.example/jobtalk/example.git"):
                if remote is not None:
                    subprocess.run(
                        ["git", "-C", str(repository), "config", "remote.origin.url", remote],
                        check=True,
                    )
                with self.subTest(remote=remote):
                    result, captured, commands = self.run_launcher(
                        cwd=repository, env_overrides={"PI_NEW_RELIC_ENABLE": "0"},
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIsNotNone(captured)
                    self.assertEqual(commands, [""])

    def test_rejects_work_origin_in_linked_worktree_after_url_rewrite(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory) / "repository"
            worktree = pathlib.Path(directory) / "worktree"
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            git = ["git", "-C", str(repository)]
            subprocess.run(
                [*git, "-c", "user.name=Test", "-c", "user.email=test@example.com",
                 "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
                 "commit", "-qm", "fixture", "--allow-empty"],
                check=True,
            )
            subprocess.run([*git, "config", "remote.origin.url", "work:example.git"], check=True)
            subprocess.run(
                [*git, "config", "url.https://github.com/jobtalk/.insteadOf", "work:"],
                check=True,
            )
            subprocess.run([*git, "worktree", "add", "-q", "--detach", str(worktree)], check=True)
            result, captured, commands = self.run_launcher(cwd=worktree, op_output="unused")
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIsNone(captured)
            self.assertEqual(commands, [])

    def test_checks_all_origin_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory)
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            for remote in ("git@github.com:kqnade/example.git",
                           "git@github.com:jobtalk/example.git"):
                subprocess.run(
                    ["git", "-C", str(repository), "config", "--add", "remote.origin.url", remote],
                    check=True,
                )
            result, captured, commands = self.run_launcher(cwd=repository, op_output="unused")
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIsNone(captured)
            self.assertEqual(commands, [])

    def test_repository_check_errors_do_not_start_pi(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory)
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            (repository / ".git/config").write_text("[invalid\n")
            result, captured, commands = self.run_launcher(cwd=repository, op_output="unused")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("repository", result.stderr)
            self.assertIsNone(captured)
            self.assertEqual(commands, [])

    def test_zsh_pi_function_routes_to_launcher(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            fake_home = pathlib.Path(temporary_directory)
            launcher = fake_home / ".local/bin/pi-telemetry"
            launcher.parent.mkdir(parents=True)
            launcher.write_text(
                "#!/bin/sh\n"
                'printf \'%s\\n\' "$*" >"$PI_TEST_ARGS"\n'
            )
            launcher.chmod(0o755)
            args_file = fake_home / "args"
            env = dict(os.environ, HOME=str(fake_home), PI_TEST_ARGS=str(args_file))
            result = subprocess.run(
                ["zsh", "-dfc", f'source "{ZSH_FUNCTION}"; pi --print "hello world"'],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(args_file.read_text(), "--print hello world\n")


if __name__ == "__main__":
    unittest.main()
