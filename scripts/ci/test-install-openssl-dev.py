#!/usr/bin/env python3
"""Fedora OpenSSL header selection follows the release."""

from __future__ import annotations

from pathlib import Path
import os
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/install-openssl-dev.sh"


class InstallOpensslDevTests(unittest.TestCase):
    def run_script(
        self,
        os_release: str,
        *,
        has_openssl_devel: bool = False,
        openssl_version: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = root / "os-release"
            release.write_text(os_release)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            log = root / "dnf.log"
            (bin_dir / "sudo").write_text("#!/bin/sh\nexec \"$@\"\n")
            (bin_dir / "dnf").write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$DNF_LOG\"\n"
            )
            installed = "0"
            if has_openssl_devel:
                installed = "1"
            (bin_dir / "rpm").write_text(
                "#!/bin/sh\n"
                '[ "$1" = "-q" ] && [ "$2" = "openssl-devel" ] && '
                '[ "$RPM_HAS_OPENSSL_DEVEL" = "1" ]\n'
            )
            if openssl_version is not None:
                (bin_dir / "openssl").write_text(
                    "#!/bin/sh\nprintf '%s\\n' \"$FAKE_OPENSSL_VERSION\"\n"
                )
            for command in bin_dir.iterdir():
                command.chmod(0o755)
            environment = os.environ.copy()
            environment.update(
                {
                    "PATH": str(bin_dir),
                    "DOTFILES_OS_RELEASE": str(release),
                    "DNF_LOG": str(log),
                    "RPM_HAS_OPENSSL_DEVEL": installed,
                }
            )
            if openssl_version is not None:
                environment["FAKE_OPENSSL_VERSION"] = openssl_version
            result = subprocess.run(
                ["/usr/bin/bash", str(SCRIPT)],
                cwd=ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            result.dnf_log = log.read_text() if log.exists() else ""  # type: ignore[attr-defined]
            return result

    def test_fedora_44_keeps_openssl_devel(self) -> None:
        result = self.run_script("ID=fedora\nVERSION_ID=44\n", has_openssl_devel=True)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "install -y openssl-devel\n")  # type: ignore[attr-defined]

    def test_fedora_45_installs_openssl3_devel(self) -> None:
        result = self.run_script("ID=fedora\nVERSION_ID=45\n")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "install -y openssl3-devel\n")  # type: ignore[attr-defined]

    def test_fedora_45_swaps_out_openssl_4_devel(self) -> None:
        result = self.run_script("ID=fedora\nVERSION_ID=45\n", has_openssl_devel=True)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "swap -y openssl-devel openssl3-devel\n")  # type: ignore[attr-defined]

    def test_later_fedora_still_uses_openssl3_devel(self) -> None:
        result = self.run_script("ID=fedora\nVERSION_ID=46\n")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "install -y openssl3-devel\n")  # type: ignore[attr-defined]

    def test_other_distributions_do_not_call_dnf(self) -> None:
        result = self.run_script("ID=arch\n")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "")  # type: ignore[attr-defined]

    def test_unnumbered_openssl_4_uses_the_compat_package(self) -> None:
        result = self.run_script(
            "ID=fedora\nVERSION_ID=rawhide\n",
            openssl_version="OpenSSL 4.0.3 1 Jan 2026",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "install -y openssl3-devel\n")  # type: ignore[attr-defined]

    def test_unnumbered_openssl_3_keeps_openssl_devel(self) -> None:
        result = self.run_script(
            "ID=fedora\nVERSION_ID=rawhide\n",
            openssl_version="OpenSSL 3.5.9 30 Sep 2025",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.dnf_log, "install -y openssl-devel\n")  # type: ignore[attr-defined]

    def test_unnumbered_release_without_openssl_fails(self) -> None:
        result = self.run_script("ID=fedora\n")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("numeric VERSION_ID", result.stderr)
        self.assertEqual(result.dnf_log, "")  # type: ignore[attr-defined]


if __name__ == "__main__":
    unittest.main()
