#!/usr/bin/env python3
"""Behavior tests for SKK dictionary freshness and yaskkserv2 reload."""

from __future__ import annotations

from pathlib import Path
import os
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "scripts/lib/runtime.sh"
BUILD = ROOT / "scripts/build-skk-dictionary.sh"


def write_executable(path: Path, text: str) -> None:
    path.write_text(text)
    path.chmod(0o755)


class DictionaryFreshnessTests(unittest.TestCase):
    def freshness(self, home: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "bash",
                "-c",
                "set -euo pipefail; source \"$1\"; "
                "if dotfiles_skk_dictionary_is_stale; then echo stale; else echo fresh; fi",
                "freshness",
                str(RUNTIME),
            ],
            env={**os.environ, "HOME": str(home)},
            capture_output=True,
            text=True,
            check=False,
        )

    def test_missing_or_older_dictionary_is_stale(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            source = home / ".skk" / "SKK-JISYO.L"
            source.parent.mkdir()
            source.write_text("source\n")
            missing = self.freshness(home)
            dictionary = home / ".skk" / "dictionary.yaskkserv2"
            dictionary.write_text("dictionary\n")
            subprocess.run(["touch", "-d", "2020-01-01", str(dictionary)], check=True)
            subprocess.run(["touch", "-d", "2021-01-01", str(source)], check=True)
            older = self.freshness(home)
            subprocess.run(["touch", "-d", "2022-01-01", str(dictionary)], check=True)
            current = self.freshness(home)

        self.assertEqual(missing.stdout.strip(), "stale", missing.stderr)
        self.assertEqual(older.stdout.strip(), "stale", older.stderr)
        self.assertEqual(current.stdout.strip(), "fresh", current.stderr)

    def test_apply_rebuilds_before_starting_services(self) -> None:
        apply = (ROOT / "scripts/apply.sh").read_text()
        doctor = (ROOT / "scripts/doctor.sh").read_text()
        runtime = RUNTIME.read_text()
        self.assertLess(
            apply.index('bash "$SCRIPT_DIR/build-skk-dictionary.sh"'),
            apply.rindex("\napply_managed_services\n"),
        )
        self.assertIn('run_check "SKK dictionary freshness"', doctor)
        self.assertIn("launchctl kickstart -k", runtime)
        self.assertIn("systemctl --user restart dev.mise.yaskkserv2.service", runtime)

    def run_build(
        self,
        home: Path,
        *,
        active: str = "1",
        restart_status: str = "0",
    ) -> subprocess.CompletedProcess[str]:
        bin_dir = home / "bin"
        bin_dir.mkdir(exist_ok=True)
        log = home / "systemctl.log"
        maker = home / "make-dictionary"
        write_executable(
            maker,
            "#!/bin/sh\n"
            "outfile=\n"
            "for arg in \"$@\"; do\n"
            "  case \"$arg\" in\n"
            "    --dictionary-filename=*) outfile=\"${arg#--dictionary-filename=}\" ;;\n"
            "  esac\n"
            "done\n"
            "printf '%s\\n' built > \"$outfile\"\n"
            "printf '%s\\n' called >> \"$MAKE_LOG\"\n",
        )
        write_executable(
            bin_dir / "mise",
            "#!/bin/sh\n"
            "if [ \"$1\" = -C ]; then shift 2; fi\n"
            "if [ \"$1\" = which ] && [ \"$2\" = yaskkserv2_make_dictionary ]; then\n"
            "  printf '%s\\n' \"$MAKE_DICTIONARY\"\n"
            "  exit 0\n"
            "fi\n"
            "printf '%s\\n' \"unexpected mise: $*\" >&2\n"
            "exit 1\n",
        )
        write_executable(
            bin_dir / "systemctl",
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" >> \"$SYSTEMCTL_LOG\"\n"
            "if [ \"$1\" = --user ] && [ \"$2\" = show-environment ]; then exit 0; fi\n"
            "if [ \"$1\" = --user ] && [ \"$2\" = is-active ]; then exit \"$SYSTEMCTL_ACTIVE_STATUS\"; fi\n"
            "if [ \"$1\" = --user ] && [ \"$2\" = restart ]; then exit \"$SYSTEMCTL_RESTART_STATUS\"; fi\n"
            "exit 0\n",
        )
        environment = os.environ.copy()
        environment.update(
            {
                "HOME": str(home),
                "PATH": f"{bin_dir}:{environment['PATH']}",
                "MAKE_DICTIONARY": str(maker),
                "MAKE_LOG": str(home / "make.log"),
                "SYSTEMCTL_LOG": str(log),
                "SYSTEMCTL_ACTIVE_STATUS": active,
                "SYSTEMCTL_RESTART_STATUS": restart_status,
            }
        )
        return subprocess.run(
            ["bash", str(BUILD)],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_rebuild_restarts_a_running_server_and_a_later_run_does_not(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            source = home / ".skk" / "SKK-JISYO.L"
            source.parent.mkdir()
            source.write_text("source\n")
            rebuilt = self.run_build(home, active="0")
            dictionary = home / ".skk" / "dictionary.yaskkserv2"
            marker = home / ".skk" / ".dictionary.yaskkserv2.restart-required"
            restart_count = (home / "systemctl.log").read_text().count(
                "restart dev.mise.yaskkserv2.service"
            )
            current = self.run_build(home, active="0")
            current_count = (home / "systemctl.log").read_text().count(
                "restart dev.mise.yaskkserv2.service"
            )
            make_count = (home / "make.log").read_text().count("called")
            dictionary_text = dictionary.read_text()
            marker_exists = marker.exists()

        self.assertEqual(rebuilt.returncode, 0, rebuilt.stderr)
        self.assertEqual(dictionary_text, "built\n")
        self.assertFalse(marker_exists)
        self.assertEqual(restart_count, 1)
        self.assertIn("Restarting yaskkserv2", rebuilt.stdout)
        self.assertEqual(current.returncode, 0, current.stderr)
        self.assertIn("dictionary is current", current.stdout)
        self.assertEqual(current_count, 1)
        self.assertEqual(make_count, 1)

    def test_skips_restart_when_the_server_is_not_running(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            source = home / ".skk" / "SKK-JISYO.L"
            source.parent.mkdir()
            source.write_text("source\n")
            result = self.run_build(home, active="3")
            log = (home / "systemctl.log").read_text()
            marker_exists = (home / ".skk" / ".dictionary.yaskkserv2.restart-required").exists()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("restart dev.mise.yaskkserv2.service", log)
        self.assertFalse(marker_exists)

    def test_failed_restart_is_retried_after_the_dictionary_is_current(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            source = home / ".skk" / "SKK-JISYO.L"
            source.parent.mkdir()
            source.write_text("source\n")
            failed = self.run_build(home, active="0", restart_status="1")
            marker = home / ".skk" / ".dictionary.yaskkserv2.restart-required"
            self.assertNotEqual(failed.returncode, 0, failed.stderr)
            self.assertTrue(marker.exists())
            (home / "systemctl.log").write_text("")
            retried = self.run_build(home, active="0", restart_status="0")
            log = (home / "systemctl.log").read_text()
            marker_exists = marker.exists()

        self.assertEqual(retried.returncode, 0, retried.stderr)
        self.assertIn("dictionary is current", retried.stdout)
        self.assertIn("restart dev.mise.yaskkserv2.service", log)
        self.assertFalse(marker_exists)


if __name__ == "__main__":
    unittest.main()
