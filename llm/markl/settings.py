"""
Mark-L's settings, read from the environment on every call.

Mark-L kept these in config/api_keys.json. Here they sit in the same .env as
the rest of the service (zypher.config loads it into os.environ at import), so
one file configures both engines. Read per call rather than at import, so a
PATCH /v1/settings that changes the mode is seen by the next request.

    ZYPHER_MARKL_GEMINI_KEY    the Gemini API key (GEMINI_API_KEY also works)
    ZYPHER_MARKL_MODE          free | paid -- see budget.py
    ZYPHER_MARKL_MODEL         general model
    ZYPHER_MARKL_LITE_MODEL    the model free mode and a quota cooldown drop to
    ZYPHER_MARKL_NAME          what the assistant calls itself by default
    ZYPHER_MARKL_TOOLS         comma-separated tools API callers may use
    ZYPHER_MARKL_MEMORY_DB     the SQLite fact store
    ZYPHER_MARKL_EMBED_MODEL   fact embeddings (paid mode only)
"""

import os
from dataclasses import dataclass

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The id clients pass as "model" to pick this engine.
MODEL_ID = "mark-l"

# Mark-L's own choices. The 2.5 line is closed to new API keys -- calls return
# 404 "no longer available to new users" although models.list() still shows
# them -- so verify a replacement with a real generate_content call.
FAST_MODEL = "gemini-3.6-flash"
LITE_MODEL = "gemini-3.5-flash-lite"
EMBED_MODEL = "gemini-embedding-001"

# Only what is safe to hand to anyone who can reach the API: phones on the home
# Wi-Fi, Restricted and Guest profiles included. Mark-L's PC-control tools
# (apps, files, messages, power) are not ported; see tools/__init__.py.
DEFAULT_TOOLS = ("web_search", "system_status", "save_memory", "recall_memory")

# A tool loop that has not settled after this many model turns is going round
# in circles; the last turn is asked to answer without tools.
MAX_TOOL_ROUNDS = 6

# Per Gemini request. A tool call can take longer; each tool has its own limit.
REQUEST_TIMEOUT_SECONDS = 90

# Changed at runtime by PATCH /v1/settings; wins over the environment.
_overrides = {}


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    mode: str
    fast_model: str
    lite_model: str
    embed_model: str
    assistant_name: str
    tools: tuple
    memory_db: str

    @property
    def is_configured(self):
        return len(self.gemini_api_key) > 15


def _env(name, default=""):
    return (os.environ.get(name) or default).strip()


def get():
    key = (_env("ZYPHER_MARKL_GEMINI_KEY") or _env("GEMINI_API_KEY")
           or _env("GOOGLE_API_KEY"))

    tools = _env("ZYPHER_MARKL_TOOLS")
    tools = tuple(t.strip() for t in tools.split(",") if t.strip()) if tools else DEFAULT_TOOLS

    mode = _overrides.get("mode") or _env("ZYPHER_MARKL_MODE", "free").lower()

    return Settings(
        gemini_api_key=key,
        mode="paid" if mode == "paid" else "free",
        fast_model=_env("ZYPHER_MARKL_MODEL", FAST_MODEL),
        lite_model=_env("ZYPHER_MARKL_LITE_MODEL", LITE_MODEL),
        embed_model=_env("ZYPHER_MARKL_EMBED_MODEL", EMBED_MODEL),
        assistant_name=_env("ZYPHER_MARKL_NAME", "Mark-L"),
        tools=tools,
        memory_db=_env(
            "ZYPHER_MARKL_MEMORY_DB",
            os.path.join(PROJECT_ROOT, ".markl", "memory.db"),
        ),
    )


def set_mode(mode):
    _overrides["mode"] = "paid" if str(mode).strip().lower() == "paid" else "free"

    return _overrides["mode"]
