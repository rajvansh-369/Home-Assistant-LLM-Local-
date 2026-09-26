"""
One Mark-L turn, start to finish.

Mark-L the desktop app holds a Gemini Live audio session open and speaks. Over
this API a turn is text in, text out, so it runs on Gemini's text models with
the same brain: Mark-L's persona, its fact memory, its tools and its free/paid
budget.

    1. system instruction: date, identity, recalled facts, persona
    2. stream generate_content, forwarding text as it arrives
    3. when the model calls tools, run them and send the results back
    4. repeat until it answers, at most MAX_TOOL_ROUNDS model turns

Learning is the model's call, as in Mark-L: it saves a fact with save_memory
when the user reveals one. Nothing is stored behind its back.

The result has the same shape as the local engine's, so a view does not care
which engine answered.
"""

import logging
import os
import threading
import time
from datetime import datetime

from . import budget, memory, registry, settings
from . import tools  # noqa: F401 -- registers the tool table

log = logging.getLogger("markl.engine")

PROMPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompt.txt")

MEMORY_TOOLS = ("save_memory", "recall_memory")

_FINISH = {
    "STOP": "stop",
    "MAX_TOKENS": "length",
    "SAFETY": "content_filter",
    "RECITATION": "content_filter",
    "BLOCKLIST": "content_filter",
    "PROHIBITED_CONTENT": "content_filter",
    "SPII": "content_filter",
}


class MarkLNotReady(Exception):
    """No Gemini API key is configured."""


class MarkLQuotaExhausted(Exception):
    """The Gemini quota is used up; the budget is in its cooldown."""


class MarkLError(Exception):
    """Gemini refused or failed the request: a bad key, an unknown model."""


class MarkL:
    """The Mark-L engine. Stateless between turns apart from the fact store.

    No lock: nothing here holds the GPU, and Gemini takes concurrent requests.
    """

    def __init__(self):
        self._client = None
        self._client_key = None
        self._client_lock = threading.Lock()
        self._persona = None

    # -- state ------------------------------------------------

    def status(self):
        return "ready" if settings.get().is_configured else "unconfigured"

    def describe(self):
        s = settings.get()

        return dict(
            status=self.status(),
            model=budget.model("fast"),
            tools=[t for t in s.tools if registry.get(t) is not None],
            name=s.assistant_name,
            **budget.status(),
        )

    def _require(self):
        if not settings.get().is_configured:
            raise MarkLNotReady(
                "Mark-L is not configured: set ZYPHER_MARKL_GEMINI_KEY in .env"
            )

    def client(self):
        from google import genai

        key = settings.get().gemini_api_key

        with self._client_lock:
            if self._client is None or self._client_key != key:
                self._client = genai.Client(
                    api_key=key,
                    # Milliseconds. Without it one stalled request holds a
                    # worker thread for the SDK's default of minutes.
                    http_options={"timeout": settings.REQUEST_TIMEOUT_SECONDS * 1000},
                )
                self._client_key = key

            return self._client

    def persona(self):
        if self._persona is None:
            with open(PROMPT_PATH, "r", encoding="utf-8") as handle:
                self._persona = handle.read()

        return self._persona

    # -- the turn ---------------------------------------------

    def answer(self, messages, web="auto", memory_on=True, temperature=None,
               top_p=None, max_tokens=None, assistant_name=None, on_event=None):
        """Answer a conversation. Blocking; call it off the event loop.

        messages: [{"role": "system"|"user"|"assistant", "content": str}]. A
            trailing assistant message is a cut-off answer to continue.
        web: "auto" offers web_search, True also tells the model to use it,
            False does not offer it.
        memory_on: recall facts into the prompt and offer the memory tools.
        assistant_name: what it calls itself this turn, e.g. the name the
            admin panel gave this engine.
        on_event(kind, payload): "status" dicts ({"stage": "recalled"},
            {"stage": "searching"}, {"stage": "tool"}), then "text" pieces.
            Raising from it cancels the turn.
        """

        from google.genai import errors as genai_errors
        from google.genai import types

        self._require()

        def event(kind, payload):
            if on_event is not None:
                on_event(kind, payload)

        started = time.monotonic()
        s = settings.get()

        system_extra, history = _split_system(messages)

        if not history:
            raise ValueError("messages needs at least one user message")

        question = next(
            (m["content"] for m in reversed(history) if m["role"] == "user"), ""
        )

        if history[-1]["role"] == "user" and not question.strip():
            raise ValueError("the last user message is empty")

        # -- 1: the system instruction ------------------------

        facts = ""
        recalled = 0

        if memory_on:
            facts, recalled = memory.format_for_prompt(query=question)

        if recalled:
            event("status", {"stage": "recalled", "count": recalled})

        name = (assistant_name or s.assistant_name).strip()
        now = datetime.now().strftime("%A, %B %d, %Y -- %I:%M %p")

        parts = [
            "[CURRENT DATE & TIME]\nRight now it is: {}\n".format(now),
            "[IDENTITY]\nYour name is {0}. Always refer to yourself as {0}.\n".format(name),
        ]

        if facts:
            parts.append(facts)

        parts.append(self.persona())

        if web is True:
            parts.append("[WEB]\nLook this up with web_search before answering.")

        if system_extra:
            parts.append(system_extra)

        allowed = [t for t in s.tools if registry.get(t) is not None]

        if web is False:
            allowed = [t for t in allowed if t != "web_search"]

        if not memory_on:
            allowed = [t for t in allowed if t not in MEMORY_TOOLS]

        declarations = registry.declarations(allowed)

        # -- 2-4: generate, running tools until it answers ----

        contents = _contents(history, types)

        def config(with_tools):
            return types.GenerateContentConfig(
                system_instruction="\n".join(parts),
                tools=[types.Tool(function_declarations=declarations)]
                if with_tools and declarations else None,
                # Tools run here, where their results can be streamed as status
                # and bounded by their own timeouts.
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                temperature=temperature,
                top_p=top_p,
                max_output_tokens=max_tokens,
            )

        text = []
        called = []
        saved = []
        live = False
        rounds = 0
        prompt_tokens = 0
        completion_tokens = 0
        finish = "stop"
        model = budget.model("fast")

        while True:
            rounds += 1
            # The last round gets no tools, so a loop that will not settle ends
            # in an answer rather than an error.
            with_tools = rounds < settings.MAX_TOOL_ROUNDS

            try:
                budget.reserve("generate")
                model = budget.model("fast")

                stream = self.client().models.generate_content_stream(
                    model=model, contents=contents, config=config(with_tools),
                )

                reply_parts = []
                calls = []
                usage = None
                reason = None

                for chunk in stream:
                    if chunk.usage_metadata is not None:
                        usage = chunk.usage_metadata

                    if not chunk.candidates:
                        continue

                    candidate = chunk.candidates[0]

                    if candidate.finish_reason is not None:
                        reason = candidate.finish_reason

                    if candidate.content is None or not candidate.content.parts:
                        continue

                    for part in candidate.content.parts:
                        # Every part goes back verbatim: function calls carry a
                        # thought signature the next request must return.
                        reply_parts.append(part)

                        if part.function_call is not None:
                            calls.append(part.function_call)

                        elif part.text and not part.thought:
                            text.append(part.text)
                            event("text", part.text)

            except budget.QuotaExhausted as error:
                raise MarkLQuotaExhausted(str(error))

            # Only Gemini's own errors: ClientGone from on_event must pass
            # through untouched to cancel the turn.
            except genai_errors.APIError as error:
                if budget.report(error):
                    raise MarkLQuotaExhausted(
                        "Gemini quota exhausted -- Mark-L is in reduced mode for "
                        "{:.0f} minutes".format(budget.QUOTA_COOLDOWN / 60)
                    )
                raise MarkLError("Gemini {}: {}".format(
                    error.code, error.message or error.status
                ))

            if usage is not None:
                prompt_tokens += usage.prompt_token_count or 0
                completion_tokens += (usage.candidates_token_count or 0) + (
                    usage.thoughts_token_count or 0
                )

            if reason is not None:
                finish = _FINISH.get(getattr(reason, "name", str(reason)), "stop")

            if not calls:
                break

            contents.append(types.Content(role="model", parts=reply_parts))
            responses = []

            for call in calls:
                args = dict(call.args or {})
                called.append(call.name)

                if call.name == "web_search":
                    live = True
                    event("status", {"stage": "searching", "tool": call.name})
                else:
                    event("status", {"stage": "tool", "tool": call.name})

                result = _run_tool(call.name, args, allowed)

                if call.name == "save_memory" and args.get("value"):
                    saved.append(str(args["value"]))

                responses.append(types.Part(function_response=types.FunctionResponse(
                    id=call.id, name=call.name, response={"result": result},
                )))

            contents.append(types.Content(role="user", parts=responses))

        return {
            "text": "".join(text).strip(),
            "finish_reason": finish,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            "meta": {
                "engine": "markl",
                "model": model,
                "sampling": None,
                "live": live,
                "sources": [],
                "cited": False,
                "recalled": recalled,
                "notes_captured": saved,
                "memory_id": None,
                "tools": called,
                "seconds": round(time.monotonic() - started, 3),
                "rounds": rounds,
                # Gemini's context holds the whole conversation.
                "history_kept": len(history),
            },
        }

    # -- memory -----------------------------------------------

    def memory_stats(self):
        return memory.stats()

    def profile(self):
        return memory.profile()

    def records(self, kind=None):
        return [] if kind == "exchange" else memory.records()

    def note(self, text, category=None, key=None):
        return memory.note(text, category, key)

    def forget(self, selector="last"):
        return memory.forget(selector)


def _run_tool(name, args, allowed):
    """A tool's result as a string. Never raises: the model must get an answer."""

    if name not in allowed or registry.get(name) is None:
        log.warning("model called a tool it was not offered: %s", name)
        return "Unknown tool: {}".format(name)

    try:
        return registry.run(name, args)
    except registry.ToolTimeout as error:
        return str(error)
    except Exception as error:
        log.error("%s failed: %s", name, error)
        return "Tool '{}' failed: {}".format(name, error)


def _split_system(messages):
    """Client system text, and the user/assistant turns in order."""

    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    history = [m for m in messages if m["role"] != "system"]

    return system, history


def _contents(history, types):
    """OpenAI turns as Gemini contents.

    Gemini cannot resume a partial reply in place, so a trailing assistant
    message -- a cut-off answer -- is followed by a request to go on from it.
    """

    contents = [
        types.Content(
            role="model" if m["role"] == "assistant" else "user",
            parts=[types.Part(text=m["content"])],
        )
        for m in history if m["content"]
    ]

    if history[-1]["role"] == "assistant":
        contents.append(types.Content(role="user", parts=[types.Part(
            text="Continue your previous answer exactly where it stopped. "
                 "Do not repeat anything already written."
        )]))

    return contents
