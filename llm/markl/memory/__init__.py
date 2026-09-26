"""
What Mark-L knows about the user. Ported from Mark-L's memory_manager.py.

Storage is unbounded (store.py); the prompt is what has a budget. Identity is
pinned -- being wrong about who the user is defeats the point -- and the rest
is ranked against the question, so a fact about the user's job surfaces when
they ask about work, not because it was edited last.

The functions at the bottom back the /v1/memory endpoints when a request asks
for engine=markl. Mark-L facts are keyed by category and key; they are shown
as records of kind "note" so a client can list both stores the same way.
"""

import logging
import re

from . import embeddings, store
from .store import CATEGORIES

log = logging.getLogger("markl.memory")

# How much of the system prompt memory may take. Identity is exempt.
PROMPT_CHAR_BUDGET = 2000

# How many non-identity facts a prompt or a recall retrieves.
TOP_K = 12

_ID_ORDER = ["name", "age", "birthday", "city", "job", "language", "school", "nationality"]

_HEADINGS = {
    "preferences": "Preferences",
    "projects": "Active Projects / Goals",
    "relationships": "People in their life",
    "wishes": "Wishes / Plans / Wants",
    "notes": "Other notes",
}


def _as_dict(row):
    return {
        "category": row["category"],
        "key": row["key"],
        "value": row["value"],
        "updated": row["updated"],
    }


def recall(query, k=TOP_K, include_identity=False):
    """The facts most relevant to query, best first.

    Relevance-led, with a small nudge for facts that have proved useful, so a
    fact actually needed before beats an equally similar one never used.
    """

    rows = [r for r in store.all_facts()
            if include_identity or r["category"] != "identity"]

    if not rows or not (query or "").strip():
        return [_as_dict(r) for r in rows[:k]]

    scores = embeddings.score(query, rows)
    ranked = sorted(
        zip(rows, scores),
        key=lambda pair: pair[1] + _usage_bonus(pair[0]),
        reverse=True,
    )
    hits = [row for row, s in ranked if s > 0][:k]

    store.mark_used([row["id"] for row in hits])

    return [_as_dict(row) for row in hits]


def _usage_bonus(row):
    """At most a tiebreak -- never enough to outrank a better match."""

    from math import log1p

    return min(0.05, 0.01 * log1p(row["access_count"]))


def format_for_prompt(query=""):
    """Memory for the system instruction, within PROMPT_CHAR_BUDGET.

    Identity first and never budgeted away, then the facts most relevant to
    query -- or the newest, with no query.
    """

    lines = []

    identity = {r["key"]: r["value"] for r in store.all_facts("identity")}

    for field in _ID_ORDER:
        if identity.get(field):
            lines.append("{}: {}".format(field.title(), identity.pop(field)))

    for key, value in identity.items():
        lines.append("{}: {}".format(key.replace("_", " ").title(), value))

    if (query or "").strip():
        others = recall(query, k=TOP_K)
    else:
        others = [_as_dict(r) for r in _by_recency()]

    used = sum(len(line) + 1 for line in lines)
    grouped = {}

    for fact in others:
        line = "  - {}: {}".format(fact["key"].replace("_", " ").title(), fact["value"])

        if used + len(line) + 1 > PROMPT_CHAR_BUDGET:
            break

        used += len(line) + 1
        grouped.setdefault(fact["category"], []).append(line)

    for category, heading in _HEADINGS.items():
        if grouped.get(category):
            lines.append("")
            lines.append(heading + ":")
            lines.extend(grouped[category])

    if not lines:
        return "", 0

    header = "[WHAT YOU KNOW ABOUT THIS PERSON -- use naturally, never recite like a list]\n"
    recalled = sum(len(v) for v in grouped.values())

    return header + "\n".join(lines) + "\n", recalled


def _by_recency():
    rows = [r for r in store.all_facts() if r["category"] != "identity"]

    return sorted(rows, key=lambda r: r["updated"], reverse=True)


def update(category, key, value):
    """Save one fact. Returns the row id, or None if nothing changed."""

    fact_id = store.put_fact(category, key, str(value))

    if fact_id is not None:
        log.info("saved %s/%s", category, key)

    return fact_id


# -- the /v1/memory surface -----------------------------------

def record(row):
    """A fact in the shape zypher's records use, plus its category and key."""

    return {
        "id": row["id"],
        "ts": row["updated"],
        "kind": "note",
        "category": row["category"],
        "key": row["key"],
        "a": row["value"],
        "uses": row["access_count"],
    }


def records():
    return [record(row) for row in store.newest_first()]


def profile():
    """Identity and preference facts, as the notes a system prompt carries."""

    rows = store.all_facts("identity") + store.all_facts("preferences")

    return ["{}: {}".format(r["key"].replace("_", " "), r["value"]) for r in rows]


def note(text, category=None, key=None):
    """Keep a fact about the user. Returns the stored record, or None."""

    text = (text or "").strip()

    if not text:
        return None

    category = category if category in CATEGORIES else "notes"
    key = (key or "").strip() or _slug(text)

    store.put_fact(category, key, text)
    row = store.connect().execute(
        "SELECT * FROM facts WHERE category = ? AND key = ?", (category, key)
    ).fetchone()

    return record(row) if row else None


def _slug(text):
    words = re.findall(r"[a-z0-9]+", text.lower())[:5]

    return "_".join(words) or "note"


def forget(selector):
    """Drop facts: 'last', 'all', a record id, 'category/key', or a key.

    Mark-L facts are named, so text is matched by name rather than by
    similarity -- a similarity match on one-line facts deletes far more than
    was meant.
    """

    selector = (selector or "").strip()

    if selector == "all":
        return store.delete_all()

    if selector == "last":
        rows = store.newest_first()
        return store.delete_ids([rows[0]["id"]]) if rows else 0

    if selector.isdigit():
        return store.delete_ids([int(selector)])

    if "/" in selector:
        category, key = selector.split("/", 1)
        return store.delete_fact(category.strip(), key.strip())

    doomed = [r["id"] for r in store.all_facts() if r["key"] == selector]

    return store.delete_ids(doomed)


def stats():
    by_category = store.count_by_category()

    return {
        "ready": True,
        "enabled": True,
        "total": sum(by_category.values()),
        "notes": sum(by_category.values()),
        "exchanges": 0,
        "rated": 0,
        "by_category": by_category,
        "encoder": "embeddings" if embeddings.available() else "lexical",
        "dir": store.path(),
        "error": None,
    }
