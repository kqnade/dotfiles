import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import tomllib
import unittest

from client_runtime_fixture import ROOT, deploy_client_runtime


SOURCE = Path(__file__).resolve().parents[2] / "dot_config/zsh/functions/cc.zsh"
REPOSITORY_SIGNER_PATHS = tuple(
    tomllib.loads((ROOT / ".chezmoidata.toml").read_text())["client_runtime"]["onepassword"]["signers"].values()
)


class GitCommitMessageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        deploy_client_runtime(self.root, {"client_runtime": {"onepassword": {"sockets": {
            "darwin": "~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
            "linux": "~/.1password/agent.sock",
        }}}})
        self.env = dict(
            os.environ,
            HOME=str(self.root),
            GIT_CONFIG_GLOBAL=os.devnull,
            GIT_CONFIG_NOSYSTEM="1",
        )
        self.env.pop("PI_CODING_AGENT_DIR", None)
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        subprocess.run(
            [
                "ssh-keygen",
                "-q",
                "-t",
                "ed25519",
                "-N",
                "",
                "-f",
                str(self.root / "signing-key"),
            ],
            check=True,
        )
        self.git("config", "commit.gpgsign", "true")
        self.git("config", "gpg.format", "ssh")
        self.git("config", "user.signingkey", str(self.root / "signing-key.pub"))
        self.git(
            "config", "gpg.ssh.allowedSignersFile", str(self.root / "allowed_signers")
        )
        (self.root / "allowed_signers").write_text(
            f'test@example.invalid namespaces="git" {(self.root / "signing-key.pub").read_text().strip()}\n'
        )
        agent_dir = self.root / ".1password"
        agent_dir.mkdir()
        self.agent_socket = agent_dir / "agent.sock"
        self.agent = subprocess.Popen(
            ["ssh-agent", "-D", "-a", str(self.agent_socket)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.stop_agent)
        for _ in range(100):
            if self.agent_socket.exists():
                break
            if self.agent.poll() is not None:
                self.fail("temporary SSH agent exited before creating its socket")
            time.sleep(0.01)
        else:
            self.fail("temporary SSH agent did not create its socket")
        self.env["SSH_AUTH_SOCK"] = str(self.agent_socket)
        subprocess.run(
            ["ssh-add", str(self.root / "signing-key")],
            env=self.env,
            check=True,
            capture_output=True,
            text=True,
        )
        self.git("commit", "--allow-empty", "-qm", "initial style reference")
        (self.root / "example.txt").write_text("staged content\n")
        self.git("add", "example.txt")
        launcher = self.root / ".local/bin/pi-telemetry"
        launcher.parent.mkdir(parents=True)
        launcher.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, pathlib, sys\n"
            "root = pathlib.Path.home()\n"
            "(root / 'args.json').write_text(json.dumps(sys.argv[1:]))\n"
            "(root / 'source.txt').write_text(os.environ.get('PI_EXECUTION_SOURCE', ''))\n"
            "(root / 'prompt.txt').write_text(sys.stdin.read())\n"
            "print(os.environ.get('TEST_MESSAGE', '✨ feat: add example'))\n"
            "sys.exit(int(os.environ.get('TEST_EXIT', '0')))\n"
        )
        launcher.chmod(0o755)
        blocker = launcher.parent / "codex"
        blocker.write_text("#!/bin/sh\nexit 99\n")
        blocker.chmod(0o755)
        self.env["PATH"] = str(launcher.parent) + os.pathsep + self.env["PATH"]

    def stop_agent(self):
        if self.agent.poll() is None:
            self.agent.terminate()
            self.agent.wait(timeout=5)

    def git(self, *args):
        return subprocess.run(
            ["git", *args],
            cwd=self.root,
            env=self.env,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()

    def run_cc(self, env=None):
        return subprocess.run(
            ["zsh", "-f", "-c", 'source "$1"; git-cc', "zsh", str(SOURCE)],
            cwd=self.root,
            env=env or self.env,
            text=True,
            capture_output=True,
        )

    def known_signer_path(self, path):
        return subprocess.run(
            [
                "zsh",
                "-f",
                "-c",
                'source "$1"; _git_cc_is_repository_1password_signer_path "$2"',
                "zsh",
                str(SOURCE),
                path,
            ],
            cwd=self.root,
            env=self.env,
            text=True,
            capture_output=True,
        )

    def known_agent_path(self, path):
        return subprocess.run(
            [
                "zsh",
                "-f",
                "-c",
                'source "$1"; _git_cc_is_repository_1password_agent_path "$2"',
                "zsh",
                str(SOURCE),
                path,
            ],
            cwd=self.root,
            env=self.env,
            text=True,
            capture_output=True,
        )

    @staticmethod
    def has_ssh_signature_header(commit):
        headers = commit.split("\n\n", 1)[0]
        return "gpgsig -----BEGIN SSH SIGNATURE-----" in headers.splitlines()

    def test_commits_pi_message_from_staged_diff_with_real_ssh_signature(self):
        result = self.run_cc()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git("log", "-1", "--format=%s"), "✨ feat: add example")
        commit = self.git("cat-file", "commit", "HEAD")
        self.assertTrue(self.has_ssh_signature_header(commit))
        self.git("verify-commit", "HEAD")
        prompt = (self.root / "prompt.txt").read_text()
        self.assertIn("+staged content", prompt)
        self.assertIn("initial style reference", prompt)
        args = json.loads((self.root / "args.json").read_text())
        self.assertEqual((self.root / "source.txt").read_text(), "git_cc")
        self.assertIn("--no-tools", args)
        self.assertIn("--print", args)
        self.assertIn("--no-session", args)
        self.assertEqual(args[args.index("--provider") + 1], "openai-codex")
        self.assertEqual(args[args.index("--model") + 1], "gpt-6-luna")

    def test_pi_extension_respects_agent_directory(self):
        self.env["PI_CODING_AGENT_DIR"] = str(self.root / "pi config")
        result = self.run_cc()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        args = json.loads((self.root / "args.json").read_text())
        self.assertEqual(
            args[args.index("--extension") + 1],
            str(self.root / "pi config/extensions/new-relic.ts"),
        )

    def test_generation_failure_keeps_changes_staged(self):
        self.env["TEST_EXIT"] = "1"
        result = self.run_cc()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "Failed to generate commit message", result.stdout + result.stderr
        )
        self.assertEqual(
            self.git("log", "-1", "--format=%s"), "initial style reference"
        )
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "example.txt")

    def test_optional_scope_matches_repository_commit_style(self):
        self.env["TEST_MESSAGE"] = "✨ feat(pi): add example"
        result = self.run_cc()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(
            self.git("log", "-1", "--format=%s"), "✨ feat(pi): add example"
        )
        self.assertTrue(
            self.has_ssh_signature_header(self.git("cat-file", "commit", "HEAD"))
        )
        self.git("verify-commit", "HEAD")

    def test_invalid_message_formats_do_not_commit(self):
        initial_commit = self.git("rev-parse", "HEAD")
        for message in (
            "",
            "🐛 feat: mismatch emoji and type",
            "🌟 feat: unsupported gitmoji",
            "✨ feat: " + "x" * 70,
            "✨ feat: add first line\nsecond line",
            "✨ feat(): empty scope",
            "✨ featpi): missing opening parenthesis",
            "✨ feat(UPPER): invalid scope",
        ):
            with self.subTest(message=message):
                self.env["TEST_MESSAGE"] = message
                result = self.run_cc()
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.git("rev-parse", "HEAD"), initial_commit)
                self.assertEqual(
                    self.git("diff", "--cached", "--name-only"), "example.txt"
                )

    def test_signing_configuration_is_required(self):
        invalid_configs = (
            ("commit.gpgsign", "false"),
            ("gpg.format", "openpgp"),
            ("gpg.ssh.program", str(self.root / "missing-signer")),
        )
        initial_commit = self.git("rev-parse", "HEAD")
        for key, value in invalid_configs:
            with self.subTest(key=key):
                self.git("config", key, value)
                result = self.run_cc()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("sign", result.stdout.lower() + result.stderr.lower())
                self.assertEqual(self.git("rev-parse", "HEAD"), initial_commit)
                if key == "gpg.ssh.program":
                    self.git("config", "--unset", key)
                else:
                    self.git("config", key, {
                        "commit.gpgsign": "true",
                        "gpg.format": "ssh",
                    }[key])

    def test_arbitrary_op_ssh_sign_program_is_not_trusted_by_name(self):
        signer = self.root / "op-ssh-sign"
        signer.write_text('#!/bin/sh\nexec ssh-keygen "$@"\n')
        signer.chmod(0o755)
        self.git("config", "gpg.ssh.program", str(signer))
        initial_commit = self.git("rev-parse", "HEAD")
        result = self.run_cc()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("repository-configured", result.stdout + result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD"), initial_commit)
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "example.txt")

    def test_repository_signer_paths_include_wsl_signer_and_reject_lookalikes(self):
        for path in REPOSITORY_SIGNER_PATHS:
            with self.subTest(path=path):
                self.assertEqual(self.known_signer_path(path).returncode, 0)
        for path in (
            str(self.root / "op-ssh-sign"),
            str(self.root / "op-ssh-sign-wsl.exe"),
            "/opt/not-1password/op-ssh-sign",
        ):
            with self.subTest(path=path):
                self.assertNotEqual(self.known_signer_path(path).returncode, 0)

    def test_repository_agent_paths_match_shell_configuration(self):
        for path in (
            self.root / "Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
            self.root / ".1password/agent.sock",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.known_agent_path(str(path)).returncode, 0)
        for path in (
            self.root / "agents/1password/agent.sock",
            self.root / ".1password/other.sock",
        ):
            with self.subTest(path=path):
                self.assertNotEqual(self.known_agent_path(str(path)).returncode, 0)

    def test_signer_failure_keeps_changes_staged(self):
        subprocess.run(["ssh-add", "-D"], env=self.env, check=True, capture_output=True)
        (self.root / "signing-key").unlink()
        result = self.run_cc()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Commit failed", result.stdout + result.stderr)
        self.assertEqual(
            self.git("log", "-1", "--format=%s"), "initial style reference"
        )
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "example.txt")

    def test_post_commit_verification_failure_keeps_signed_commit(self):
        initial_commit = self.git("rev-parse", "HEAD")
        hook = self.root / ".git/hooks/post-commit"
        hook.write_text('#!/bin/sh\n: > "$HOME/allowed_signers"\n')
        hook.chmod(0o755)
        result = self.run_cc()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("could not be verified", result.stdout + result.stderr)
        self.assertNotEqual(self.git("rev-parse", "HEAD"), initial_commit)
        self.assertTrue(
            self.has_ssh_signature_header(self.git("cat-file", "commit", "HEAD"))
        )
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "")

    def test_unsigned_commit_is_rejected_even_if_verifier_returns_success(self):
        real_git = shutil.which("git")
        self.assertIsNotNone(real_git)
        wrapper_dir = self.root / "git-wrapper"
        wrapper_dir.mkdir()
        verified = self.root / "verify-was-called"
        wrapper = wrapper_dir / "git"
        wrapper.write_text(
            "#!/bin/sh\n"
            'case "$1" in\n'
            f'  commit) exec "{real_git}" -c commit.gpgsign=false "$@" ;;\n'
            f'  verify-commit) : > "{verified}"; exit 0 ;;\n'
            "esac\n"
            f'exec "{real_git}" "$@"\n'
        )
        wrapper.chmod(0o755)
        env = dict(self.env, PATH=str(wrapper_dir) + os.pathsep + self.env["PATH"])
        env["TEST_MESSAGE"] = "✨ feat: gpgsig -----BEGIN SSH SIGNATURE-----"
        result = self.run_cc(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("without an SSH signature", result.stdout + result.stderr)
        self.assertFalse(verified.exists())
        self.assertFalse(
            self.has_ssh_signature_header(self.git("cat-file", "commit", "HEAD"))
        )
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "")

    def test_no_staged_changes_does_not_invoke_pi(self):
        self.git("reset", "-q", "HEAD", "--", "example.txt")
        self.assertNotEqual(self.run_cc().returncode, 0)
        self.assertFalse((self.root / "args.json").exists())


if __name__ == "__main__":
    unittest.main()
