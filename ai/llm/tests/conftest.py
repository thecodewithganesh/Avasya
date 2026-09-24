"""Bridge the shared test fixtures from tests/conftest.py into ai/llm/tests.

The teammate's documented test command is `python -m pytest ai/llm/tests -q`;
pytest only auto-loads conftest.py from ancestor directories of the test path,
so the repo-root fixtures (in-memory SQLite stack, db_session, client) are
re-exported here explicitly.
"""
from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = str(Path(__file__).resolve().parents[3])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

# tests/conftest.py defines db_session/client and builds the shared in-memory
# SQLite schema; importing it registers those fixtures for this directory too.
from tests.conftest import db_session, client  # noqa: E402,F401

__all__ = ["client", "db_session"]
