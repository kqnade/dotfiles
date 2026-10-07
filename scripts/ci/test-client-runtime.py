import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest

from client_runtime_fixture import ROOT, deploy_client_runtime


class ClientRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.config = deploy_client_runtime(self.home, {"client_runtime": {"pi": {"agent_dir": "~/.pi/agent"}}})
        self.env = {"HOME": str(self.home), "PATH": os.environ["PATH"]}

    def render(self, path, overrides, environment=None):
        return subprocess.check_output(
            [
                "chezmoi",
                "--source",
                str(ROOT),
                "--override-data",
                json.dumps(overrides),
                "execute-template",
                "--file",
                str(ROOT / path),
            ],
            env=environment or self.env,
            text=True,
        )

    def shell(self, command, shell="bash", environment=None):
        return subprocess.run(
            [shell, "-c", command],
            env=environment or self.env,
            text=True,
            capture_output=True,
        )

    def test_defaults_and_explicit_overrides_are_exported_in_bash_and_zsh(self):
        defaults = tomllib.loads((ROOT / ".chezmoidata.toml").read_text())[
            "client_runtime"
        ]
        variables = [
            "PI_CODING_AGENT_DIR",
            "NEW_RELIC_LICENSE_KEY_OP_REF",
            "PI_DECISION_API_KEY_OP_REF",
            "GITHUB_PAT_OP_REF",
        ]
        expected = [
            str(self.home / ".pi/agent"),
            defaults["onepassword"]["references"]["new_relic"],
            defaults["onepassword"]["references"]["decision_api"],
            defaults["onepassword"]["references"]["github"],
        ]
        command = 'source "$HOME/.config/dotfiles/client-runtime.sh"; dotfiles_client_environment && '
        command += "printf '%s\\n' " + " ".join(f'"${name}"' for name in variables)
        for shell in ["bash", "zsh"]:
            with self.subTest(shell=shell):
                result = self.shell(command, shell)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.splitlines(), expected)
                overrides = dict(
                    zip(
                        variables,
                        [
                            str(self.home / "custom pi"),
                            "op://Tests/NR/key",
                            "op://Tests/Decision/key",
                            "op://Tests/GitHub/token",
                        ],
                    )
                )
                result = self.shell(command, shell, {**self.env, **overrides})
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.splitlines(), list(overrides.values()))

    def test_rendered_references_and_paths_are_literal_shell_values(self):
        marker = self.home / "injected"
        reference = f"op://Personal/owner's $(touch {marker})/api key"
        socket = f"~/socket's $(touch {marker})"
        self.config.write_text(
            self.render(
                "dot_config/dotfiles/client-runtime.sh.tmpl",
                {
                    "client_runtime": {
                        "onepassword": {
                            "references": {"decision_api": reference},
                            "sockets": {"linux": socket},
                        }
                    },
                },
            )
        )
        for shell in ["bash", "zsh"]:
            result = self.shell(
                'source "$HOME/.config/dotfiles/client-runtime.sh"; '
                "dotfiles_client_environment && "
                'printf "%s\\n" "$PI_DECISION_API_KEY_OP_REF" "$DOTFILES_OP_SOCKET_LINUX"',
                shell,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                result.stdout.splitlines(), [reference, str(self.home) + socket[1:]]
            )
            self.assertFalse(marker.exists())

    def test_child_extension_uses_configured_or_environment_agent_directory(self):
        for directory, env in [
            (str(self.home / "configured pi"), self.env),
            ("~/alternate pi", {**self.env, "PI_CODING_AGENT_DIR": "~/alternate pi"}),
        ]:
            settings = json.loads(
                self.render(
                    "dot_pi/agent/settings.json.tmpl",
                    {
                        "client_runtime": {
                            "pi": {"agent_dir": str(self.home / "configured pi")}
                        },
                    },
                    env,
                )
            )
            self.assertEqual(
                settings["subagents"]["defaultExtensions"],
                [directory + "/extensions/execution-guard.ts"],
            )

    def test_signer_and_socket_checks_follow_configuration_not_environment(self):
        signer = str(self.home / "1Password/op-ssh-sign")
        socket = str(self.home / "1Password/agent.sock")
        overrides = {
            "client_runtime": {
                "onepassword": {
                    "signers": {"linux": signer},
                    "sockets": {"linux": socket},
                }
            }
        }
        self.config.write_text(
            self.render("dot_config/dotfiles/client-runtime.sh.tmpl", overrides)
        )
        gitconfig = self.render(
            "dot_gitconfig.tmpl",
            {
                **overrides,
                "chezmoi": {"os": "linux", "kernel": {"osrelease": "linux"}},
            },
        )
        self.assertIn(f'program = "{signer}"', gitconfig)
        command = f'source "{ROOT}/dot_config/zsh/functions/cc.zsh" && '
        command += '[[ "$DOTFILES_OP_SOCKET_LINUX" = "$EXPECTED_SOCKET" ]] && '
        command += '_git_cc_is_repository_1password_signer_path "$EXPECTED_SIGNER" && '
        command += '! _git_cc_is_repository_1password_signer_path "$UNTRUSTED_SIGNER"'
        result = self.shell(
            command,
            "zsh",
            {
                **self.env,
                "EXPECTED_SIGNER": signer,
                "EXPECTED_SOCKET": socket,
                "UNTRUSTED_SIGNER": "/tmp/op-ssh-sign",
                "DOTFILES_OP_SIGNER_LINUX": "/tmp/op-ssh-sign",
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_empty_or_relative_agent_directory_fails_explicitly(self):
        for directory in ["", "relative/path"]:
            result = self.shell(
                'source "$HOME/.config/dotfiles/client-runtime.sh"; dotfiles_client_environment',
                environment={**self.env, "PI_CODING_AGENT_DIR": directory},
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("PI_CODING_AGENT_DIR", result.stderr)

    def test_claude_credentials_fail_explicitly_without_starting_the_client(self):
        fake_bin = self.home / "bin"
        fake_bin.mkdir()
        guard = self.home / ".claude/hooks/authorize-repository.sh"
        guard.parent.mkdir(parents=True)
        for path, script in [
            (guard, 'printf "guard\\n" >>"$COMMAND_LOG"; exit "${GUARD_STATUS:-0}"'),
            (fake_bin / "op", 'printf "op %s\\n" "$*" >>"$COMMAND_LOG"; '
             'printf "%s\\n" "${OP_KEY:-}"; exit "${OP_STATUS:-0}"'),
            (fake_bin / "claude", 'printf "claude %s\\n" "$GITHUB_PERSONAL_ACCESS_TOKEN" >>"$COMMAND_LOG"'),
        ]:
            path.write_text("#!/bin/sh\n" + script + "\n")
            path.chmod(0o755)
        deploy_client_runtime(self.home, {"client_runtime": {"onepassword": {
            "references": {"github": "op://Tests/GitHub/token"},
        }}})
        log = self.home / "commands.log"
        command = f'source "{ROOT}/dot_config/zsh/functions/claude.zsh"; claude --version'
        cases = [
            ({"OP_KEY": "test-token"}, 0, ["guard", "op read op://Tests/GitHub/token", "claude test-token"]),
            ({"GITHUB_PAT_OP_REF": "op://Override/GitHub/token", "OP_KEY": "test-token"}, 0,
             ["guard", "op read op://Override/GitHub/token", "claude test-token"]),
            ({"GITHUB_PERSONAL_ACCESS_TOKEN": "explicit-token"}, 0, ["guard", "claude explicit-token"]),
            ({"OP_STATUS": "1"}, 1, ["guard", "op read op://Tests/GitHub/token"]),
            ({}, 1, ["guard", "op read op://Tests/GitHub/token"]),
            ({"GITHUB_PAT_OP_REF": ""}, 1, ["guard"]),
            ({"GUARD_STATUS": "1"}, 1, ["guard"]),
        ]
        for overrides, status, expected in cases:
            with self.subTest(overrides=overrides):
                log.write_text("")
                result = self.shell(command, "zsh", {**self.env, **overrides,
                    "PATH": f"{fake_bin}:{self.env['PATH']}", "COMMAND_LOG": str(log),
                })
                self.assertEqual(result.returncode, status, result.stderr)
                self.assertEqual(log.read_text().splitlines(), expected)

    def test_loading_configuration_does_not_export_reference_defaults(self):
        command = 'source "$HOME/.config/dotfiles/client-runtime.sh" && '
        command += '[[ -z "${NEW_RELIC_LICENSE_KEY_OP_REF+x}${PI_DECISION_API_KEY_OP_REF+x}${GITHUB_PAT_OP_REF+x}" ]]'
        for shell in ["bash", "zsh"]:
            result = self.shell(command, shell)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_git_helper_reports_missing_configuration(self):
        self.config.unlink()
        result = self.shell(f'source "{ROOT}/dot_config/zsh/functions/cc.zsh"', "zsh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("configuration is missing", result.stderr)


if __name__ == "__main__":
    unittest.main()
