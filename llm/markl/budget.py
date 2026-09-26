"""
Free-tier / paid-tier policy for every Gemini call. Ported from Mark-L.

The 429 this exists to stop:

    RESOURCE_EXHAUSTED -- You exceeded your current quota

Two modes, set with ZYPHER_MARKL_MODE or PATCH /v1/settings:

    paid  -- everything on: grounded search, the fast model, embeddings
    free  -- only what a free key can sustain:
               * no grounded search   -> DuckDuckGo instead (no quota at all)
               * lite model           -> the biggest free per-day allowance
               * a local rate limit   -> FREE_RPM requests/minute, so a burst
                                         cannot trip a per-minute quota

A 429 from any call (paid mode included) trips a cooldown via report(), during
which everything degrades exactly as if free mode were on. Quota comes back on
its own; hammering the API while it is exhausted only produces more errors.

    budget.reserve("grounded_search")   # raises QuotaExhausted -> use fallback
    budget.model("fast")                # the model id to actually send
"""

import logging
import threading
import time
from collections import deque

from . import settings

log = logging.getLogger("markl.budget")

FREE = "free"
PAID = "paid"

# Requests per minute allowed while degraded. Free-tier per-minute limits sit
# at 10-15 depending on the model; staying under the lowest one is the point.
FREE_RPM = 8

# Longer than this and waiting for a slot is worse than failing.
MAX_WAIT = 12.0

# How long a 429 keeps the engine degraded.
QUOTA_COOLDOWN = 900.0

# Features a free key cannot sustain. Normal generation is not here on
# purpose: it is the assistant's core, and the lite model covers it.
FREE_BLOCKED = {"grounded_search", "embeddings"}


class QuotaExhausted(RuntimeError):
    """Raised instead of making a call that is expected to fail with 429."""


_lock = threading.Lock()
_calls = deque()          # monotonic timestamps of recent Gemini calls
_quota_until = 0.0        # monotonic deadline of the current cooldown
_notified = False         # cooldown already logged


def get_mode():
    return settings.get().mode


def cooldown_remaining():
    with _lock:
        return max(0.0, _quota_until - time.monotonic())


def degraded():
    """Free mode, or paid mode inside a quota cooldown."""

    return get_mode() == FREE or cooldown_remaining() > 0


def model(tier="fast"):
    """The model id to send for tier "fast" or "lite". Degraded drops to lite."""

    s = settings.get()

    if degraded():
        return s.lite_model

    return s.lite_model if tier == "lite" else s.fast_model


def allows(feature):
    return not (degraded() and feature in FREE_BLOCKED)


def reserve(feature="generate"):
    """Clear a Gemini call, or raise QuotaExhausted so the caller falls back.

    Blocks for up to MAX_WAIT seconds when the local rate limit is the only
    thing in the way -- a short wait beats a failed answer.
    """

    if not allows(feature):
        raise QuotaExhausted("{} is off in free mode".format(feature))

    if not degraded():
        return

    while True:
        now = time.monotonic()

        with _lock:
            while _calls and now - _calls[0] >= 60.0:
                _calls.popleft()

            if len(_calls) < FREE_RPM:
                _calls.append(now)
                return

            wait = 60.0 - (now - _calls[0])

        if wait > MAX_WAIT:
            raise QuotaExhausted(
                "free-mode rate limit reached -- {:.0f}s until the next slot".format(wait)
            )

        time.sleep(min(wait, MAX_WAIT) + 0.05)


def is_quota_error(error):
    text = str(error)

    return "RESOURCE_EXHAUSTED" in text or "429" in text


def report(error):
    """Record a failed call. Returns True if it was a quota error.

    Every except around a Gemini call passes the exception here -- that is what
    turns one 429 into a cooldown instead of a repeating failure.
    """

    global _quota_until, _notified

    if not is_quota_error(error):
        return False

    with _lock:
        first = time.monotonic() >= _quota_until
        _quota_until = time.monotonic() + QUOTA_COOLDOWN

        if first:
            _notified = False

        notify, _notified = not _notified, True

    if notify:
        log.warning("quota exhausted (429) -- reduced mode for %.0f min: lite model, "
                    "no grounded search", QUOTA_COOLDOWN / 60)

    return True


def status():
    remaining = cooldown_remaining()

    return {
        "mode": get_mode(),
        "degraded": degraded(),
        "cooldown_seconds": round(remaining),
    }
