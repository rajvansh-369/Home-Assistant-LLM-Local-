"""
save_memory and recall_memory. Ported from Mark-L's actions/session_tools.py.

The model decides what is worth keeping: it calls save_memory when the user
reveals something about themselves, and recall_memory when they refer to
something personal that is not in the prompt.
"""

import logging

from markl import memory
from markl.registry import tool

log = logging.getLogger("markl.memory_tools")


@tool(
    name="save_memory",
    description=(
        "Save an important personal fact about the user to long-term memory. "
        "Call this silently whenever the user reveals something worth remembering: "
        "name, age, city, job, preferences, hobbies, relationships, projects, or future plans. "
        "Do NOT call for: weather, reminders, searches, or one-time commands. "
        "Do NOT announce that you are saving. "
        "Values must be in English regardless of the conversation language."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "category": {
                "type": "STRING",
                "description": (
                    "identity -- name, age, birthday, city, job, language, nationality | "
                    "preferences -- favorite food/color/music/film/game/sport, hobbies | "
                    "projects -- active projects, goals, things being built | "
                    "relationships -- friends, family, partner, colleagues | "
                    "wishes -- future plans, things to buy, travel dreams | "
                    "notes -- habits, schedule, anything else worth remembering"
                ),
            },
            "key": {"type": "STRING",
                    "description": "Short snake_case key (e.g. name, favorite_food, sister_name)"},
            "value": {"type": "STRING",
                      "description": "Concise value in English (e.g. Fatih, pizza, older sister)"},
        },
        "required": ["category", "key", "value"],
    },
    timeout=10,
)
def save_memory_tool(params):
    category = params.get("category", "notes")
    key = params.get("key", "")
    value = params.get("value", "")

    if key and value:
        memory.update(category, key, value)

    return "ok"


@tool(
    name="recall_memory",
    description=(
        "Search everything you have ever been told about the user and get back "
        "the facts that match. Only a handful of the most relevant facts are loaded "
        "at the start of a conversation, so use this whenever the user refers to "
        "something personal you cannot see: 'what was my sister's name', "
        "'which framework do I use'. Also use it before saying you do not know or "
        "do not remember something personal -- it is very often stored, just not loaded."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "What to look for, in English -- e.g. 'sister', 'travel plans'",
            },
        },
        "required": ["query"],
    },
    timeout=20,
)
def recall_memory_tool(params):
    query = str(params.get("query", "")).strip()

    if not query:
        return "Tell me what to look for."

    hits = memory.recall(query, include_identity=True)

    if not hits:
        return "I have nothing stored about '{}'.".format(query)

    lines = ["{}: {}".format(h["key"].replace("_", " "), h["value"]) for h in hits]

    return "Here is what I have stored:\n" + "\n".join(lines)
