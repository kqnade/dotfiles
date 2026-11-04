#!/usr/bin/env python3

"""Validate machine-readable repository files."""

from __future__ import annotations

import json

from validate_common import ROOT, fail, tracked_files


for path in tracked_files():
    if path.suffix != ".json":
        continue
    try:
        json.loads(path.read_text())
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {error}")
