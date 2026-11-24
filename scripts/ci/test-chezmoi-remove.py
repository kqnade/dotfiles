#!/usr/bin/env python3
"""Keep .chezmoiremove limited to previously managed files and symlinks."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
LANGUAGES = (
    "clojure",
    "cpp",
    "go",
    "java",
    "kotlin",
    "lua",
    "python",
    "ruby",
    "rust",
    "sh",
    "typescript",
)
MANAGED = [
    ".config/cmux/cmux.json",
    *(
        f".config/project-maker/templates/{language}/{name}"
        for language in LANGUAGES
        for name in (".gitignore", "mise.toml")
    ),
]
DIRECTORIES = (".config/cmux", ".config/project-maker")
UNMANAGED = {
    ".config/cmux/session-state.json": "session\n",
    ".config/project-maker/custom.txt": "custom\n",
    ".config/project-maker/templates/rust/custom.txt": "notes\n",
}


def remove_entries():
    entries = []
    for line in (ROOT / ".chezmoiremove").read_text().splitlines():
        entry = line.strip()
        if entry and not entry.startswith("#"):
            entries.append(entry)
    return entries


class ChezmoiRemoveTests(unittest.TestCase):
    def test_entries_name_specific_files(self):
        entries = remove_entries()
        for directory in DIRECTORIES:
            self.assertNotIn(directory, entries)
        for relative in MANAGED:
            self.assertIn(relative, entries)
        for parent in entries:
            children = [child for child in entries if child.startswith(parent + "/")]
            self.assertEqual(children, [], parent)

    def test_apply_removes_managed_files_and_keeps_unmanaged_siblings(self):
        with tempfile.TemporaryDirectory() as temporary:
            temp = Path(temporary)
            home = temp / "home"
            home.mkdir()
            for relative in (*MANAGED, *UNMANAGED):
                path = home / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(UNMANAGED.get(relative, "outdated managed file\n"))
            command = [
                "chezmoi",
                "--source",
                str(ROOT),
                "--destination",
                str(home),
                "--override-data",
                '{"claude_work_enabled":false}',
                "--persistent-state",
                str(temp / "state.boltdb"),
                "--no-tty",
                "apply",
                "--include=remove",
            ]
            environment = {
                **os.environ,
                "HOME": str(home),
                "XDG_CACHE_HOME": str(temp / "cache"),
                "XDG_CONFIG_HOME": str(temp / "config"),
                "XDG_DATA_HOME": str(temp / "data"),
            }
            for _ in range(2):
                result = subprocess.run(
                    command,
                    cwd=home,
                    env=environment,
                    text=True,
                    capture_output=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                for relative in MANAGED:
                    self.assertFalse((home / relative).exists(), relative)
                for relative, contents in UNMANAGED.items():
                    self.assertEqual((home / relative).read_text(), contents, relative)


if __name__ == "__main__":
    unittest.main()
