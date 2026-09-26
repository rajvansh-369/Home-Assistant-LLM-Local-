"""
Web search -- Gemini grounded search first, DuckDuckGo fallback. Ported from
Mark-L's actions/web_search.py.

Grounded search has the tightest free-tier allowance of anything, so free mode
(and a quota cooldown) goes straight to DuckDuckGo, which needs no quota.
"""

import logging
import threading

from markl import budget, settings
from markl.registry import tool

log = logging.getLogger("markl.websearch")


def _gemini_search(query):
    """Grounded search. Raises in free mode or a cooldown; callers fall back."""

    from google import genai

    budget.reserve("grounded_search")

    client = genai.Client(api_key=settings.get().gemini_api_key)

    try:
        response = client.models.generate_content(
            model=budget.model("fast"),
            contents=query,
            config={"tools": [{"google_search": {}}]},
        )
    except Exception as error:
        budget.report(error)
        raise

    text = "".join(
        part.text for part in response.candidates[0].content.parts
        if getattr(part, "text", None)
    ).strip()

    if not text:
        raise ValueError("Gemini returned an empty response")

    return text


def _ddg_search(query, max_results=6):
    from ddgs import DDGS

    with DDGS() as ddgs:
        return [
            {"title": r.get("title", ""), "snippet": r.get("body", ""), "url": r.get("href", "")}
            for r in ddgs.text(query, max_results=max_results)
        ]


def _ddg_news(query, max_results=8):
    """Articles, not homepages. Falls back to a text search if news fails."""

    from ddgs import DDGS

    try:
        with DDGS() as ddgs:
            return [
                {"title": r.get("title", ""), "snippet": r.get("body", ""),
                 "url": r.get("url", ""), "source": r.get("source", "")}
                for r in ddgs.news(query, max_results=max_results)
            ]
    except Exception as error:
        log.info("DDG news failed (%s), using text search", error)
        return _ddg_search(query, max_results=max_results)


def _format_ddg(query, results):
    if not results:
        return "No results found for: {}".format(query)

    lines = ["Search results for: {}\n".format(query)]

    for i, r in enumerate(results, 1):
        if r.get("title"):
            lines.append("{}. {}".format(i, r["title"]))
        if r.get("snippet"):
            lines.append("   " + r["snippet"])
        if r.get("url"):
            lines.append("   Source: " + r["url"])
        lines.append("")

    return "\n".join(lines).strip()


def _format_news(query, results):
    if not results:
        return "No news found for: {}".format(query)

    lines = ["Latest news: {}\n".format(query)]

    for i, r in enumerate(results, 1):
        if not r.get("title"):
            continue

        source = "  [{}]".format(r["source"]) if r.get("source") else ""
        lines.append("{}. {}{}".format(i, r["title"], source))

        if r.get("snippet"):
            lines.append("   " + r["snippet"][:140])
        if r.get("url"):
            lines.append("   " + r["url"])
        lines.append("")

    return "\n".join(lines).strip()


def _fallback(what, error):
    """Free mode falling back is normal operation, not an error."""

    if isinstance(error, budget.QuotaExhausted):
        log.info("%s -> DuckDuckGo (%s)", what, error)
    elif budget.report(error):
        log.warning("%s: quota exhausted -- DuckDuckGo from here", what)
    else:
        log.warning("%s failed (%s) -- trying DuckDuckGo", what, error)


def _search(query, ddg_query=None, max_results=6):
    try:
        return _gemini_search(query)
    except Exception as error:
        _fallback("Gemini search", error)
        ddg_query = ddg_query or query
        return _format_ddg(ddg_query, _ddg_search(ddg_query, max_results=max_results))


def _news(query):
    """Grounded search and DDG news in parallel; the first valid result wins."""

    gemini_query = "latest news today: {}".format(query) if query else "top world news today"
    ddg_query = query or "world news today"

    box = [None]
    lock = threading.Lock()
    done = threading.Event()
    failures = [0]

    def keep(result):
        with lock:
            if result and len(result) > 60:
                if box[0] is None:
                    box[0] = result
                done.set()
            else:
                failures[0] += 1
                if failures[0] >= 2:
                    done.set()

    def try_gemini():
        try:
            keep(_gemini_search(gemini_query))
        except Exception as error:
            _fallback("Gemini news", error)
            keep("")

    def try_ddg():
        try:
            keep(_format_news(ddg_query, _ddg_news(ddg_query)))
        except Exception as error:
            log.warning("DDG news failed (%s)", error)
            keep("")

    # In free mode the Gemini half would only burn a request to fail.
    if budget.allows("grounded_search"):
        threading.Thread(target=try_gemini, daemon=True).start()
    else:
        failures[0] += 1

    threading.Thread(target=try_ddg, daemon=True).start()

    done.wait(timeout=10.0)

    return box[0] or "No news found for: {}".format(query)


def _compare(items, aspect):
    query = "Compare {} in terms of {}. Give specific facts and data.".format(
        ", ".join(items), aspect
    )

    try:
        return _gemini_search(query)
    except Exception as error:
        _fallback("Gemini compare", error)

    lines = ["Comparison -- {}".format(aspect.upper())]

    for item in items:
        lines.append("\n> " + item)

        try:
            results = _ddg_search("{} {}".format(item, aspect), max_results=3)
        except Exception:
            results = []

        for r in results[:2]:
            if r.get("snippet"):
                lines.append("  - " + r["snippet"])
            if r.get("url"):
                lines.append("    " + r["url"])

    return "\n".join(lines)


def web_search(params):
    query = str(params.get("query", "")).strip()
    mode = str(params.get("mode", "search")).lower().strip()
    items = params.get("items") or []
    aspect = str(params.get("aspect", "general")).strip() or "general"

    if not query and not items:
        return "Please provide a search query."

    if items:
        mode = "compare"

    log.info("mode=%r query=%r", mode, query)

    try:
        if mode == "compare":
            return _compare(items, aspect)

        if mode == "news":
            return _news(query)

        if mode == "research":
            return _search(
                "Comprehensive, detailed explanation of: {}. Include background "
                "context, key facts, current state, and important nuances.".format(query),
                ddg_query=query, max_results=10,
            )

        if mode == "price":
            return _search(
                "current price of {} -- how much does it cost today".format(query),
                ddg_query="{} price buy".format(query),
            )

        return _search(query)

    except Exception as error:
        log.error("all search backends failed: %s", error)
        return "Search failed: {}".format(error)


@tool(
    name="web_search",
    description=(
        "Searches the web. Use for ANY question about current facts, events, prices, "
        "weather or topics -- always prefer this over guessing. "
        "Modes: 'search' (default), 'news' (latest headlines on a topic), "
        "'research' (deep comprehensive answer), 'price' (product cost lookup), "
        "'compare' (side-by-side comparison of items)."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {"type": "STRING", "description": "Search query or topic"},
            "mode": {"type": "STRING", "description": "search | news | research | price | compare"},
            "items": {"type": "ARRAY", "items": {"type": "STRING"},
                      "description": "Items to compare (compare mode)"},
            "aspect": {"type": "STRING", "description": "Comparison aspect: price | specs | reviews | features"},
        },
        "required": ["query"],
    },
    timeout=60,
)
def web_search_tool(params):
    return web_search(params)
