"""
Tool registry -- one place a tool declares itself. Ported from Mark-L.

A tool owns its schema next to its implementation:

    @tool(
        name="system_status",
        description="Real-time CPU, RAM and GPU metrics",
        parameters={"type": "OBJECT", "properties": {}},
        timeout=15,
    )
    def system_status_tool(params):
        return str(get_system_status())

declarations() builds the Gemini function schema from the same objects that
hold the implementations, so the two cannot drift apart. Every tool has a
timeout: a tool that hangs must still produce a function response, or the
model waits for one that never comes.

Mark-L ran tools from its asyncio session. Here a turn already runs on a
worker thread, so tools are plain functions run on a bounded pool.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass

log = logging.getLogger("markl.registry")

# Bounded, so a pile of hung tools cannot starve the process of threads.
EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="markl-tool")

DEFAULT_TIMEOUT = 30.0


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    fn: object
    timeout: float = DEFAULT_TIMEOUT

    def declaration(self):
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }


_REGISTRY = {}


def tool(name, description, parameters=None, timeout=DEFAULT_TIMEOUT):
    """Register fn(params: dict) -> str as a Gemini-callable tool."""

    def decorator(fn):
        _REGISTRY[name] = Tool(
            name=name,
            description=description,
            parameters=parameters or {"type": "OBJECT", "properties": {}},
            fn=fn,
            timeout=timeout,
        )
        return fn

    return decorator


def get(name):
    return _REGISTRY.get(name)


def names():
    return sorted(_REGISTRY)


def declarations(allowed):
    """Gemini function declarations for the registered tools in allowed."""

    return [_REGISTRY[n].declaration() for n in sorted(_REGISTRY) if n in allowed]


class ToolTimeout(Exception):
    """A tool overran its declared timeout."""


def run(name, params):
    """Run a registered tool and return its result string.

    Raises KeyError for an unknown tool, ToolTimeout for an overrun, and
    whatever the tool raised otherwise. The caller turns all three into a
    function response. A timed-out thread keeps running until it returns; the
    pool size bounds how many can.
    """

    entry = _REGISTRY[name]
    future = EXECUTOR.submit(entry.fn, params)

    try:
        result = future.result(timeout=entry.timeout)
    except FutureTimeout:
        log.warning("%s exceeded its %ss timeout", name, entry.timeout)
        raise ToolTimeout(
            "{} took longer than {:.0f} seconds and was stopped.".format(name, entry.timeout)
        )

    return "Done." if result is None else str(result)
