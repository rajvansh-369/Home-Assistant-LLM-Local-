"""
Mark-L, as a second engine for zypherLL.

Mark-L (D:\\GIT\\Mark-L) is a desktop voice assistant on the Gemini Live API.
This package carries over the parts of it that work over an HTTP API, so a
request with engine "markl" is answered by Mark-L's brain instead of the local
Zephyr model:

    settings.py   Gemini key, models, mode and tools, from .env
    budget.py     free / paid policy, local rate limit, 429 cooldown
    registry.py   @tool declarations and timed execution
    prompt.txt    Mark-L's persona, rewritten for text replies
    memory/       Mark-L's SQLite fact store and relevance ranking
    tools/        web_search, system_status, save_memory, recall_memory
    engine.py     one turn: prompt, streaming generation, tool calls

Left behind: the voice session, the HUD, vision, the phone dashboard, the
background loops and every tool that acts on the PC (see tools/__init__.py).
"""

from .engine import MarkL, MarkLError, MarkLNotReady, MarkLQuotaExhausted
from .settings import MODEL_ID
