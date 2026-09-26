"""
Importing this package registers every ported tool.

Ported from Mark-L: web_search, system_status, save_memory, recall_memory.

Not ported, on purpose. Mark-L is a desktop voice agent, and most of its tools
act on the PC in front of the person talking to it -- open apps, type and
click, change volume or power, delete files, send WhatsApp messages as the
owner, write and run code. Over this API the caller is a phone on the home
Wi-Fi, possibly a Restricted or Guest profile, so none of those are exposed.
weather_report is not ported either: it opens a browser tab on the PC rather
than returning the weather; web_search answers weather questions instead.

ZYPHER_MARKL_TOOLS narrows the set further, per machine.
"""

from . import memory_tools, system_status, web_search  # noqa: F401
