"""
SQLite behind Mark-L's memory. Ported from Mark-L's memory/store.py.

Facts about the user, one row each, keyed by (category, key). The store is
unbounded; memory.manager decides what fits in the prompt -- identity always,
then whatever is most relevant to the question.

The facts table is the same as Mark-L's, so ZYPHER_MARKL_MEMORY_DB can point
at an existing Mark-L memory/memory.db to carry its facts over. Mark-L's
sessions and monitors tables are left alone if present.
"""

import logging
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime

from markl import settings

log = logging.getLogger("markl.memory.store")

# The categories the model may write to. identity is never dropped from the
# prompt, so it stays small by convention.
CATEGORIES = ("identity", "preferences", "projects", "relationships", "wishes", "notes")

# A rambling "fact" is a summarisation failure, and it would crowd real ones
# out of the prompt budget.
MAX_VALUE_LENGTH = 380

_SCHEMA = """
CREATE TABLE IF NOT EXISTS facts (
    id           INTEGER PRIMARY KEY,
    category     TEXT    NOT NULL,
    key          TEXT    NOT NULL,
    value        TEXT    NOT NULL,
    created      TEXT    NOT NULL,
    updated      TEXT    NOT NULL,
    last_used    TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    embedding    BLOB,
    embed_model  TEXT,
    UNIQUE (category, key)
);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts (category);
CREATE INDEX IF NOT EXISTS idx_facts_updated  ON facts (updated);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""

# One connection, one lock. Writes are small and rare; correctness is the
# point, not contention. RLock so a transaction may call a reading helper.
_lock = threading.RLock()
_conn = None
_path = None


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _now():
    return datetime.now().isoformat(timespec="seconds")


def path():
    return settings.get().memory_db


def connect():
    """The process-wide connection, opened on first use."""

    global _conn, _path

    with _lock:
        if _conn is not None:
            return _conn

        _path = path()
        os.makedirs(os.path.dirname(_path) or ".", exist_ok=True)

        conn = sqlite3.connect(_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # WAL: survives a hard kill mid-write, and lets the Mark-L desktop app
        # read the same file while this process writes.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.executescript(_SCHEMA)
        conn.commit()

        _conn = conn

        return conn


def close():
    """Release the connection -- tests point the store elsewhere between runs."""

    global _conn

    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None


@contextmanager
def txn():
    """Read-modify-write under the lock, committed on clean exit."""

    conn = connect()

    with _lock:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# -- facts ----------------------------------------------------

def put_fact(category, key, value):
    """Insert or update one fact. Returns the row id, or None if nothing changed.

    An unchanged rewrite is a no-op on purpose: updated is used for ranking,
    and the model re-saves the same fact often enough that touching it would
    make every old fact look new.
    """

    category = category if category in CATEGORIES else "notes"
    key = (key or "").strip()
    value = (value or "").strip()[:MAX_VALUE_LENGTH]

    if not key or not value:
        return None

    with txn() as conn:
        row = conn.execute(
            "SELECT id, value FROM facts WHERE category = ? AND key = ?", (category, key)
        ).fetchone()

        if row and row["value"] == value:
            return None

        if row:
            conn.execute(
                "UPDATE facts SET value = ?, updated = ?, embedding = NULL, embed_model = NULL "
                "WHERE id = ?",
                (value, _today(), row["id"]),
            )
            return row["id"]

        cursor = conn.execute(
            "INSERT INTO facts (category, key, value, created, updated) VALUES (?, ?, ?, ?, ?)",
            (category, key, value, _today(), _today()),
        )

        return cursor.lastrowid


def get_fact(fact_id):
    return connect().execute("SELECT * FROM facts WHERE id = ?", (fact_id,)).fetchone()


def delete_fact(category, key):
    with txn() as conn:
        cursor = conn.execute(
            "DELETE FROM facts WHERE category = ? AND key = ?", (category, key)
        )

    return cursor.rowcount


def delete_ids(ids):
    if not ids:
        return 0

    marks = ",".join("?" * len(ids))

    with txn() as conn:
        cursor = conn.execute("DELETE FROM facts WHERE id IN ({})".format(marks), tuple(ids))

    return cursor.rowcount


def delete_all():
    with txn() as conn:
        cursor = conn.execute("DELETE FROM facts")

    return cursor.rowcount


def all_facts(category=None):
    sql = "SELECT * FROM facts"
    params = ()

    if category:
        sql += " WHERE category = ?"
        params = (category,)

    return connect().execute(sql + " ORDER BY category, key", params).fetchall()


def newest_first():
    return connect().execute("SELECT * FROM facts ORDER BY id DESC").fetchall()


def facts_by_ids(ids):
    if not ids:
        return []

    marks = ",".join("?" * len(ids))

    return connect().execute(
        "SELECT * FROM facts WHERE id IN ({})".format(marks), tuple(ids)
    ).fetchall()


def count_by_category():
    rows = connect().execute(
        "SELECT category, COUNT(*) AS n FROM facts GROUP BY category"
    ).fetchall()

    return {row["category"]: row["n"] for row in rows}


def mark_used(ids):
    """Record that these facts were surfaced -- a small tiebreak in ranking."""

    if not ids:
        return

    with txn() as conn:
        conn.executemany(
            "UPDATE facts SET access_count = access_count + 1, last_used = ? WHERE id = ?",
            [(_now(), i) for i in ids],
        )


def set_embedding(fact_id, blob, model):
    with txn() as conn:
        conn.execute(
            "UPDATE facts SET embedding = ?, embed_model = ? WHERE id = ?",
            (blob, model, fact_id),
        )


def facts_missing_embeddings(model, limit=64):
    return connect().execute(
        "SELECT * FROM facts WHERE embedding IS NULL OR embed_model IS NOT ? LIMIT ?",
        (model, limit),
    ).fetchall()
