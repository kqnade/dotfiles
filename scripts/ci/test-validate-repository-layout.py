#!/usr/bin/env python3

"""Regression tests for repository layout validation."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Path("scripts/ci/validate-repository-layout.py")
FIXTURE_FILES = (
    Path(".chezmoiremove"),
    Path("dot_config/opencode/symlink_AGENTS.md"),
    Path("scripts/ci/validate-repository-layout.py"),
    Path("scripts/ci/validate_common.py"),
)
LEGACY_PATH_COMPONENT = "home" + "brew"


@contextmanager
def fixture_repository() -> Iterator[Path]:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for relative in FIXTURE_FILES:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)

        subprocess.run(
            ["git", "init", "-q", "-b", "trunk", str(root)],
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "-C", str(root), "add", *map(str, FIXTURE_FILES)],
            check=True,
            capture_output=True,
            text=True,
        )
        yield root


def run_validator(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(root / VALIDATOR)],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )


class ValidateRepositoryLayoutTests(unittest.TestCase):
    def test_dev_record_may_keep_historical_legacy_path(self) -> None:
        with fixture_repository() as root:
            record = root / ".dev/historical.md"
            record.parent.mkdir()
            record.write_text(
                f"/opt/{LEGACY_PATH_COMPONENT}/bin/python3.14\n",
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_deployed_source_rejects_legacy_path(self) -> None:
        with fixture_repository() as root:
            source = root / "dot_config/deployed-config"
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text(
                f"/opt/{LEGACY_PATH_COMPONENT}/bin/python3.14\n",
                encoding="utf-8",
            )

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("obsolete integration reference", result.stderr)
        self.assertIn("deployed-config", result.stderr)

    def test_dev_json_still_requires_valid_json(self) -> None:
        with fixture_repository() as root:
            record = root / ".dev/invalid.json"
            record.parent.mkdir()
            record.write_text("{\n", encoding="utf-8")

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid JSON", result.stderr)
        self.assertIn("invalid.json", result.stderr)


if __name__ == "__main__":
    unittest.main()
