"""
Endpoints. Each one translates HTTP to an Assistant call and back.

Two engines answer: "local" (Zephyr on this PC) and "markl" (Mark-L on
Gemini). Chat picks one in the body -- "engine", or "model": "mark-l" -- and
the memory calls take ?engine=, since each engine keeps its own store. Left
out, it is the server default: "engine" in /v1/settings.

    GET    /health                      load state per engine, device (no auth)
    GET    /v1/models                   both engines
    POST   /v1/chat/completions         answer, optionally as server-sent events
    GET    /v1/memory                   stats and the notes in the system prompt
    GET    /v1/memory/records           stored records, newest first
    POST   /v1/memory/notes             keep a fact about the user
    POST   /v1/memory/{id}/rate         good / bad (local only)
    DELETE /v1/memory                   forget last | all | <text>
    GET    /v1/settings                 server-wide defaults
    PATCH  /v1/settings                 change them
"""

import asyncio
import hmac
import json
import threading
import time
import uuid
from typing import Literal, Optional

import torch
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from markl import MODEL_ID as MARKL_MODEL_ID
from markl import MarkLError, MarkLNotReady, MarkLQuotaExhausted
from markl import settings as markl_settings
from zypher import config
from zypher.model import llm, retrieval
from zypher.model.llm import ClientGone
from zypher.presenter import ModelNotReady, resolve_engine

from .schemas import ChatRequest, Engine, NoteRequest, RateRequest, SettingsRequest

OOM_MESSAGE = "out of GPU memory -- send less history or lower max_tokens"

ENGINE_MODELS = {"local": config.MODEL_ID, "markl": MARKL_MODEL_ID}

# "model" values that name an engine. Anything else -- a stock OpenAI client
# sending "gpt-4o" -- gets the server default.
MODEL_ENGINES = {
    config.MODEL_ID: "local", "local": "local",
    MARKL_MODEL_ID: "markl", "markl": "markl",
}

# Why an engine cannot answer, by its status: (HTTP status, message).
NOT_READY = {
    "loading": (503, "model is still loading"),
    "off": (503, "the local model is switched off (ZYPHER_LOCAL_MODEL=off)"),
    "unconfigured": (503, "Mark-L is not configured: set ZYPHER_MARKL_GEMINI_KEY in .env"),
}

# Errors whose message is already fit to show a user.
READABLE_ERRORS = (ValueError, ModelNotReady, MarkLNotReady, MarkLQuotaExhausted, MarkLError)


def authorize(request: Request):
    if config.API_KEY is None:
        return

    # Constant-time compare, so the key cannot be recovered byte by byte from
    # response timings.
    supplied = request.headers.get("authorization", "")

    if not hmac.compare_digest(supplied.encode(), ("Bearer " + config.API_KEY).encode()):
        raise HTTPException(401, "invalid or missing API key")


def assistant_of(request: Request):
    return request.app.state.assistant


public = APIRouter()
router = APIRouter(dependencies=[Depends(authorize)])


def not_ready(assistant, state):
    """(HTTP status, message) for an engine in a state other than ready."""

    if state == "error":
        return 500, "model failed to load: {}".format(assistant.error)

    return NOT_READY[state]


# -- system ---------------------------------------------------

@public.get("/health")
def health(assistant=Depends(assistant_of)):
    """status, error and model are the default engine's; engines has both."""

    engine = config.DEFAULT_ENGINE
    engines = {name: assistant.status(name) for name in config.ENGINES}
    state = engines[engine]
    usable = state in ("ready", "loading")

    return {
        "status": state if usable else "error",
        "error": None if usable else not_ready(assistant, state)[1],
        "engine": engine,
        "model": ENGINE_MODELS[engine],
        "engines": engines,
        "device": llm.DEVICE,
        "vram_gb": round(llm.VRAM_GB, 2),
        "auth": config.API_KEY is not None,
    }


@router.get("/v1/models")
def models(assistant=Depends(assistant_of)):
    return {
        "object": "list",
        "data": [
            {
                "id": config.MODEL_ID,
                "object": "model",
                "created": 0,
                "owned_by": "local",
                "root": config.MODEL_NAME,
                "engine": "local",
                "status": assistant.status("local"),
            },
            {
                "id": MARKL_MODEL_ID,
                "object": "model",
                "created": 0,
                "owned_by": "markl",
                "root": assistant.markl.describe()["model"],
                "engine": "markl",
                "status": assistant.status("markl"),
            },
        ],
    }


def current_settings(assistant):
    return {
        "engine": config.DEFAULT_ENGINE,
        "web": config.RETRIEVAL_ENABLED,
        "memory": config.MEMORY_ENABLED,
        "max_tokens": config.MAX_TOTAL_NEW_TOKENS,
        "max_prompt_tokens": config.MAX_PROMPT_TOKENS,
        "markl": assistant.markl.describe(),
    }


@router.get("/v1/settings")
def get_settings(assistant=Depends(assistant_of)):
    return current_settings(assistant)


@router.patch("/v1/settings")
def patch_settings(body: SettingsRequest, assistant=Depends(assistant_of)):
    """Server-wide defaults: what a request gets when it does not say."""

    if body.engine is not None:
        config.DEFAULT_ENGINE = body.engine

    if body.markl_mode is not None:
        markl_settings.set_mode(body.markl_mode)

    if body.web is not None:
        config.RETRIEVAL_ENABLED = body.web

        # Switching it back on is how a client says the network is back
        # after repeated failures paused lookups.
        if body.web:
            retrieval.reset_failures()

    if body.memory is not None:
        config.MEMORY_ENABLED = body.memory

    if body.max_tokens is not None:
        config.MAX_TOTAL_NEW_TOKENS = body.max_tokens

    return current_settings(assistant)


# -- chat -----------------------------------------------------

def engine_of(body):
    """engine, else the engine the model names, else the server default."""

    return resolve_engine(body.engine or MODEL_ENGINES.get((body.model or "").lower()))


@router.post("/v1/chat/completions")
async def chat_completions(body: ChatRequest, assistant=Depends(assistant_of)):
    engine = engine_of(body)
    state = assistant.status(engine)

    if state != "ready":
        raise HTTPException(*not_ready(assistant, state))

    messages = [message.as_dict() for message in body.messages]

    options = dict(
        engine=engine,
        assistant_name=body.assistant_name,
        web=body.web,
        memory=body.memory,
        sampling=body.sampling,
        temperature=body.temperature,
        top_p=body.top_p,
        max_tokens=body.max_completion_tokens or body.max_tokens,
        min_tokens=body.min_tokens,
    )

    meta = {
        "id": "chatcmpl-" + uuid.uuid4().hex,
        "created": int(time.time()),
        "model": ENGINE_MODELS[engine],
    }

    if body.stream:
        return StreamingResponse(
            stream(assistant, messages, options, meta),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        result = await asyncio.to_thread(assistant.answer, messages, **options)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except (ModelNotReady, MarkLNotReady) as error:
        raise HTTPException(503, str(error))
    except MarkLQuotaExhausted as error:
        raise HTTPException(429, str(error))
    except MarkLError as error:
        raise HTTPException(502, str(error))
    except torch.cuda.OutOfMemoryError:
        raise HTTPException(503, OOM_MESSAGE)

    return {
        "id": meta["id"],
        "object": "chat.completion",
        "created": meta["created"],
        "model": meta["model"],
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": result["text"]},
            "finish_reason": result["finish_reason"],
        }],
        "usage": result["usage"],
        "zypher": public_meta(result["meta"]),
    }


def public_meta(meta):
    return {key: value for key, value in meta.items() if key != "history_kept"}


def sse(payload):
    return "data: {}\n\n".format(json.dumps(payload, ensure_ascii=False))


def chunk(meta, delta, finish_reason=None, **extra):
    payload = {
        "id": meta["id"],
        "object": "chat.completion.chunk",
        "created": meta["created"],
        "model": meta["model"],
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }
    payload.update(extra)

    return sse(payload)


async def stream(assistant, messages, options, meta):
    """Server-sent events in the OpenAI chunk format.

    Search, recall and tool progress is sent as chunks with an empty delta and
    a "zypher" field, which OpenAI clients ignore. The last chunk carries the
    finish reason, usage and sources.
    """

    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()
    gone = threading.Event()

    def on_event(kind, payload):
        if gone.is_set():
            raise ClientGone()

        loop.call_soon_threadsafe(queue.put_nowait, (kind, payload))

    def run():
        try:
            result = assistant.answer(messages, on_event=on_event, **options)
            loop.call_soon_threadsafe(queue.put_nowait, ("done", result))
        except ClientGone:
            pass
        except BaseException as error:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", error))

    loop.run_in_executor(None, run)

    try:
        yield chunk(meta, {"role": "assistant", "content": ""})

        while True:
            kind, payload = await queue.get()

            if kind == "text":
                yield chunk(meta, {"content": payload})

            elif kind == "status":
                yield chunk(meta, {}, zypher=payload)

            elif kind == "done":
                yield chunk(
                    meta, {},
                    finish_reason=payload["finish_reason"],
                    usage=payload["usage"],
                    zypher=public_meta(payload["meta"]),
                )
                break

            else:
                message = (
                    OOM_MESSAGE if isinstance(payload, torch.cuda.OutOfMemoryError)
                    else str(payload) if isinstance(payload, READABLE_ERRORS)
                    else "{}: {}".format(type(payload).__name__, payload)
                )
                yield sse({"error": {"message": message}})
                break

        yield "data: [DONE]\n\n"

    finally:
        # The client disconnected, or the stream ended: either way the next
        # token callback stops the generation instead of running to the cap
        # with the GPU lock held. The worker winds itself down.
        gone.set()


# -- memory ---------------------------------------------------

def memory_call(function, *args):
    try:
        return function(*args)
    except ModelNotReady as error:
        raise HTTPException(503, str(error))
    except ValueError as error:
        raise HTTPException(400, str(error))


@router.get("/v1/memory")
def memory_overview(engine: Optional[Engine] = None, assistant=Depends(assistant_of)):
    return {
        "engine": resolve_engine(engine),
        "stats": memory_call(assistant.memory_stats, engine),
        "profile": memory_call(assistant.profile, engine),
    }


@router.get("/v1/memory/records")
def memory_records(kind: Optional[Literal["note", "exchange"]] = None,
                   limit: int = 50, offset: int = 0,
                   engine: Optional[Engine] = None,
                   assistant=Depends(assistant_of)):
    records = memory_call(assistant.records, kind, engine)
    offset = max(0, offset)

    return {"total": len(records), "records": records[offset:offset + max(0, limit)]}


@router.post("/v1/memory/notes")
def memory_note(body: NoteRequest, engine: Optional[Engine] = None,
                assistant=Depends(assistant_of)):
    record = memory_call(assistant.note, body.text, engine, body.category, body.key)

    if record is None:
        raise HTTPException(503, "memory is off or unavailable")

    return record


@router.post("/v1/memory/{record_id}/rate")
def memory_rate(record_id: int, body: RateRequest, engine: Optional[Engine] = None,
                assistant=Depends(assistant_of)):
    record = memory_call(assistant.rate, record_id, body.rating == "good", engine)

    if record is None:
        raise HTTPException(404, "no memory with id {}".format(record_id))

    return record


@router.delete("/v1/memory")
def memory_forget(selector: str = "last", engine: Optional[Engine] = None,
                  assistant=Depends(assistant_of)):
    """Drop memories.

    local: 'last', 'all', or free text matched by similarity.
    markl: 'last', 'all', a record id, 'category/key', or a fact's key.
    """

    return {"removed": memory_call(assistant.forget, selector, engine)}
