# zypherLL — Project Detail

A local Zephyr 7B assistant (`richardyoung/zephyr-7b-beta-abliterated`) with
live web lookup and self-learning memory, available as a console chat and as an
OpenAI-compatible HTTP API. Both front ends share one pipeline.

- [1. Overview](#1-overview)
- [2. Project structure](#2-project-structure)
- [3. Architecture (MVP)](#3-architecture-mvp)
- [4. Flows](#4-flows)
- [5. HTTP API reference](#5-http-api-reference)
- [6. Console commands](#6-console-commands)
- [7. Configuration](#7-configuration)
- [8. Data storage](#8-data-storage)

---

## 1. Overview

| Item | Value |
|---|---|
| Language | Python 3.11 (3.9+ works) |
| Model | `richardyoung/zephyr-7b-beta-abliterated`, exposed as model id `zephyr-7b` |
| Inference | `transformers` + `torch`, 4-bit NF4 via `bitsandbytes` on 5–16 GB cards |
| API server | FastAPI + uvicorn |
| Memory encoder | `sentence-transformers/all-MiniLM-L6-v2` (CPU), with a hashed n-gram fallback |
| Web search | `ddgs` (`DDGS().text`), region `us-en`, last-month results by default |
| Entry point | `main.py` — `chat` (default) or `serve` |

```bash
python main.py                                # console chat
python main.py serve                          # HTTP API on ZYPHER_HOST:ZYPHER_PORT
python main.py serve --host 0.0.0.0 --port 8080
```

---

## 2. Project structure

```
zypherLL/
├── main.py                        entry point: argparse -> cli.main() or api.app.serve()
├── .env                           per-machine settings (git-ignored)
├── requirements.txt               dependencies
├── README.md                      user guide
├── projectDetail.md               this file
├── test.html                      sample long output produced by the runner
├── postman/
│   ├── zypherLL.postman_collection.json          every endpoint, ready to send
│   └── zypherLL.local.postman_environment.json   baseUrl, apiKey, memoryId
└── zypher/
    ├── __init__.py                process-wide env (Xet off, CUDA allocator, UTF-8 stdout)
    ├── config.py                  every setting + the .env loader
    ├── model/                     MODEL: LLM, memory, web — no user I/O
    │   ├── llm/
    │   │   ├── __init__.py        public surface of the LLM package
    │   │   ├── device.py          GPU detection, VRAM, small-card budgets
    │   │   ├── download.py        resumable download, SHA-256 shard verification, verify cache
    │   │   ├── loader.py          tokenizer, load plan (bf16 / 4-bit / CPU), warm-up, offload check
    │   │   ├── prompt.py          system prompt, chat template, BOS, history trimming
    │   │   ├── sampling.py        pick precise / balanced / creative per question
    │   │   └── generation.py      streaming, KV-cache reuse, auto-continue, stop strings, clean-up
    │   ├── memory.py              semantic memory: exchanges, notes, ratings, recall, forget
    │   └── retrieval.py           live-data router, web search, grounding, source list
    ├── presenter/
    │   ├── __init__.py            exports Assistant, ModelNotReady
    │   └── assistant.py           Assistant: load, answer (one turn), memory operations
    └── view/
        ├── cli.py                 console loop and slash commands
        └── api/
            ├── app.py             FastAPI app factory, background model load, uvicorn
            ├── routes.py          endpoints, bearer auth, SSE streaming
            └── schemas.py         pydantic request bodies
```

### Module responsibilities

| Module | Key functions / classes | Role |
|---|---|---|
| `config.py` | `_load_dotenv`, constants | Loads `.env` without overriding the shell. Runtime-mutable settings are read as `config.NAME` so changes propagate |
| `model/llm/device.py` | `describe_device` | Detects CUDA and VRAM; halves budgets under 8 GB |
| `model/llm/download.py` | `download_model`, `verify_model_files`, `quarantine` | Downloads with resume, checks each shard against the Hub hash, deletes corrupt shards, caches the verification result |
| `model/llm/loader.py` | `load_tokenizer`, `choose_load_plan`, `load_model`, `warm_up`, `assert_fully_on_gpu` | Chooses precision from VRAM; refuses silent CPU offload |
| `model/llm/prompt.py` | `system_prompt`, `render`, `build_prompt_ids` | Builds the system prompt (date + notes), applies the Zephyr template, trims old turns to `MAX_PROMPT_TOKENS` |
| `model/llm/sampling.py` | `pick_sampling` | Code/maths/facts/grounded → `precise`; stories → `creative`; otherwise `balanced` |
| `model/llm/generation.py` | `generate_response`, `reuse_cache`, `ContextStreamer`, `StopFilter`, `GeneratedRepetitionPenalty`, `MinLengthEOSBlock`, `CancelOnEvent`, `clean_reply`, `ClientGone` | Token generation with KV-cache prefix reuse and auto-continue across `MAX_NEW_TOKENS` rounds |
| `model/memory.py` | `Memory` (`remember`, `note`, `capture_notes`, `recall`, `block`, `profile`, `rate`, `forget`, `stats`), `ground` | Persistent JSONL + vector store |
| `model/retrieval.py` | `needs_live_data`, `fetch_context`, `ground`, `reset_failures` | Decides when to search, fetches and numbers snippets, backs off after two failures |
| `presenter/assistant.py` | `Assistant.load`, `.status`, `.answer`, `.reset`, `.memory_stats`, `.profile`, `.records`, `.note`, `.rate`, `.forget` | The single place where a turn is run |
| `view/cli.py` | `main` | Console I/O and slash commands |
| `view/api/app.py` | `create_app`, `serve` | Builds the app; loads the model on a background thread |
| `view/api/routes.py` | `authorize`, endpoint handlers, `stream`, `chunk` | HTTP ↔ `Assistant` translation |
| `view/api/schemas.py` | `ChatRequest`, `Message`, `NoteRequest`, `RateRequest`, `SettingsRequest` | Validation |

---

## 3. Architecture (MVP)

```
            ┌──────────────────────┐        ┌──────────────────────────────┐
  person ──▶│  view/cli.py         │        │  view/api (FastAPI)          │◀── HTTP client
            │  console + commands  │        │  auth, JSON, SSE             │
            └──────────┬───────────┘        └──────────────┬───────────────┘
                       │  Assistant.answer(messages, ...)  │
                       └───────────────┬───────────────────┘
                                       ▼
                     ┌─────────────────────────────────────┐
                     │ presenter/assistant.py  (Assistant) │
                     │ ground → generate → learn           │
                     │ threading.Lock: one generation/time │
                     └───┬──────────────┬──────────────┬───┘
                         ▼              ▼              ▼
                ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
                │ model/llm    │ │ model/      │ │ model/       │
                │ Zephyr 7B    │ │ memory.py   │ │ retrieval.py │
                │ KV cache     │ │ .memory/    │ │ web search   │
                └──────────────┘ └─────────────┘ └──────────────┘
```

Rules:

- Views never touch the model layer directly (the API only reads
  `llm.DEVICE` / `llm.VRAM_GB` for `/health` and calls `retrieval.reset_failures()`).
- A change to how a turn works is made once, in `Assistant.answer()`.
- Generations are serialised by `Assistant.lock` — one model, one GPU.

---

## 4. Flows

### 4.1 Startup

```
main.py
 ├─ chat  → view/cli.main()      → Assistant.load() (blocking)  → prompt loop
 └─ serve → view/api/app.serve() → uvicorn(create_app())
                                     └─ lifespan: Thread(Assistant.load)
                                        /health = "loading" until ready
```

`Assistant.load()`:

1. `Memory()` — starts loading the sentence encoder on a background thread.
2. `llm.download_model()` — download or resume, then verify shard SHA-256 (cached).
3. `llm.load_tokenizer()`.
4. `llm.load_model()` — plan by VRAM:

   | VRAM | Plan |
   |---|---|
   | ≥ 16 GB | bf16 on GPU |
   | 5–16 GB | 4-bit NF4 on GPU (~3.8 GB) |
   | < 5 GB / no GPU | bf16 on CPU |

   Any layer offloaded off the GPU is an error, not a silent slowdown.
5. `llm.warm_up()` — one throwaway generation so the first answer is not slow.
6. `ready` is set; on failure `error` is set and `/health` reports `error`.

### 4.2 One turn — `Assistant.answer()`

```
messages ─▶ split system text / history
         ─▶ continuing?  (last message is a partial assistant reply)
         │
         ├─ 1. WEB      web=True, or web="auto" + RETRIEVAL_ENABLED + needs_live_data(q)
         │              → status {"stage":"searching"}
         │              → retrieval.fetch_context(q) → numbered snippets + sources
         │              → retrieval.ground(q, context)
         │
         ├─ 2. MEMORY   (if memory on) store.recall(q) → ≤3 hits, ≤1200 chars
         │              → memory.ground(grounded, block)
         │              → status {"stage":"recalled","count":n}
         │              → store.profile() → ≤8 notes for the system prompt
         │
         ├─ 3. PROMPT   system = SYSTEM_PROMPT + date + notes (+ client system text)
         │              question replaced by its grounded version (this turn only)
         │
         ├─ 4. GENERATE sampling profile (request > pick_sampling), temp/top_p overrides
         │              budget = min(max_tokens, MAX_TOTAL_NEW_TOKENS)
         │              with lock: llm.generate_response(...)
         │                • reuse KV cache for shared prompt prefix
         │                • stream text → on_event("text", piece)
         │                • stop at EOS or role marker; auto-continue at MAX_NEW_TOKENS
         │              llm.clean_reply(...)
         │
         └─ 5. LEARN    capture_notes(q)            → notes_captured
                        if finished and not live:   store.remember(q, answer) → memory_id
                        cited sources = those whose [n] appears in the answer
```

Returned dict:

```json
{
  "text": "...",
  "finish_reason": "stop | length",
  "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
  "meta": {
    "sampling": "precise | balanced | creative",
    "live": false,
    "sources": [{"n": 1, "title": "...", "url": "..."}],
    "cited": false,
    "recalled": 0,
    "notes_captured": [],
    "memory_id": 12,
    "seconds": 3.214,
    "rounds": 1,
    "history_kept": 4
  }
}
```

`history_kept` is used by the console only and is removed from API responses.

### 4.3 Continue

When the last message is an assistant message, the answer is continued in place.
If it is the answer this process just produced, the same grounded question,
web context and sources are reused, so the prompt bytes match and the whole KV
cache is kept. A truncated answer (`finish_reason: "length"`) is not stored in
memory.

### 4.4 Streaming (API)

```
client ──POST stream:true──▶ routes.stream()
                              ├─ worker thread: assistant.answer(on_event=...)
                              │     on_event → loop.call_soon_threadsafe(queue.put)
                              └─ async generator reads queue:
                                   first   → delta {"role":"assistant","content":""}
                                   status  → delta {}, "zypher": {...}
                                   text    → delta {"content": piece}
                                   done    → finish_reason, usage, "zypher": meta
                                   error   → {"error":{"message":...}}
                                   then    → data: [DONE]
client disconnects → gone.set() → next on_event raises ClientGone → generation stops
```

### 4.5 Learning

| Event | Effect |
|---|---|
| Finished, non-live exchange | Stored as `kind: "exchange"`; same question again replaces the old answer |
| Statement about the user ("My name is…", "I always use…") | Captured as `kind: "note"`, shown in every system prompt |
| `/good` or `POST /v1/memory/{id}/rate {"rating":"good"}` | `score += 1` → ranks higher in recall |
| `/bad` or `rating: "bad"` | `score` set ≤ −1 → excluded from recall |
| Live / web-grounded answer | Never stored (would go stale) |

---

## 5. HTTP API reference

Base URL: `http://{ZYPHER_HOST}:{ZYPHER_PORT}` (default `http://127.0.0.1:8000`).

### 5.1 Authentication

If `ZYPHER_API_KEY` is set, every endpoint except `GET /health` requires:

```
Authorization: Bearer <ZYPHER_API_KEY>
```

The key is compared in constant time. Missing or wrong key → `401 {"detail": "invalid or missing API key"}`.
If the key is unset the API is open; `serve` prints a warning when bound to a
non-localhost address without a key.

### 5.2 Endpoint summary

| # | Method | Path | Auth | Purpose |
|---|---|---|---|---|
| 1 | GET | `/health` | no | Load state, device, VRAM, whether auth is on |
| 2 | GET | `/v1/models` | yes | The single model |
| 3 | GET | `/v1/settings` | yes | Server-wide defaults |
| 4 | PATCH | `/v1/settings` | yes | Change defaults |
| 5 | POST | `/v1/chat/completions` | yes | Answer (JSON or SSE) |
| 6 | GET | `/v1/memory` | yes | Memory stats and profile notes |
| 7 | GET | `/v1/memory/records` | yes | Stored records, newest first |
| 8 | POST | `/v1/memory/notes` | yes | Add a note (`/remember`) |
| 9 | POST | `/v1/memory/{record_id}/rate` | yes | Rate a record (`/good` / `/bad`) |
| 10 | DELETE | `/v1/memory` | yes | Forget records (`/forget`) |

FastAPI also serves interactive docs at `/docs` and the schema at `/openapi.json`.

---

### 5.3 `GET /health`

No auth. Available immediately after the server starts.

**Response 200**

```json
{
  "status": "loading | ready | error",
  "error": null,
  "device": "cuda",
  "vram_gb": 6.0,
  "auth": true
}
```

| Field | Meaning |
|---|---|
| `status` | `loading` until the model is up, `error` if loading failed |
| `error` | Load error text, else `null` |
| `device` | `cuda` or `cpu` |
| `vram_gb` | Detected VRAM (GB, 2 dp) |
| `auth` | `true` when `ZYPHER_API_KEY` is set |

---

### 5.4 `GET /v1/models`

**Response 200**

```json
{
  "object": "list",
  "data": [{
    "id": "zephyr-7b",
    "object": "model",
    "created": 0,
    "owned_by": "local",
    "root": "richardyoung/zephyr-7b-beta-abliterated"
  }]
}
```

---

### 5.5 `GET /v1/settings`

**Response 200**

```json
{
  "web": true,
  "memory": true,
  "max_tokens": 8192,
  "max_prompt_tokens": 8192
}
```

`max_tokens` and `max_prompt_tokens` are 4096 on cards under 8 GB.

### 5.6 `PATCH /v1/settings`

Changes server-wide defaults (what a request gets when it does not specify).
In-memory only — reset on restart. All fields optional.

**Request**

| Field | Type | Effect |
|---|---|---|
| `web` | bool | `RETRIEVAL_ENABLED`. Setting `true` also clears the search-failure back-off |
| `memory` | bool | `MEMORY_ENABLED` |
| `max_tokens` | int ≥ 1 | `MAX_TOTAL_NEW_TOKENS` (answer budget ceiling) |

```json
{"web": true, "memory": true, "max_tokens": 2048}
```

**Response 200** — the new settings, same shape as `GET /v1/settings`.
**422** — validation error.

---

### 5.7 `POST /v1/chat/completions`

OpenAI-compatible. Unknown OpenAI fields (`n`, `stop`, `seed`, …) are accepted
and ignored.

**Request**

| Field | Type | Default | Notes |
|---|---|---|---|
| `model` | string | `zephyr-7b` | Ignored; there is one model |
| `messages` | array, min 1 | — | `{role: system\|user\|assistant, content: string \| [{type:"text", text}]}`. Multi-part content is flattened to its text parts |
| `stream` | bool | `false` | `true` → server-sent events |
| `max_tokens` | int ≥ 1 | server setting | Capped at `MAX_TOTAL_NEW_TOKENS` |
| `max_completion_tokens` | int ≥ 1 | — | Takes precedence over `max_tokens` |
| `temperature` | float 0–2 | from profile | `0` → greedy decoding |
| `top_p` | float (0, 1] | from profile | |
| `web` | `"auto"` \| bool | `"auto"` | `"auto"`: router decides; `true`: force search; `false`: never |
| `memory` | bool | server setting | Recall and learn on this request |
| `sampling` | `precise` \| `balanced` \| `creative` | per question | Overrides automatic choice |
| `min_tokens` | int ≥ 1 | — | Blocks end-of-turn until this many tokens; capped at the budget |

Message semantics:

- Client `system` messages are **appended** to the runner's own system prompt.
- The last `user` message is the question.
- If `messages` ends with an `assistant` message, that reply is continued.

**Example**

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer $ZYPHER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Who won the match last night?"}],"web":"auto"}'
```

**Response 200 (`stream: false`)**

```json
{
  "id": "chatcmpl-3f2a...",
  "object": "chat.completion",
  "created": 1790000000,
  "model": "zephyr-7b",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 812, "completion_tokens": 240, "total_tokens": 1052},
  "zypher": {
    "sampling": "precise",
    "live": true,
    "sources": [{"n": 1, "title": "...", "url": "https://..."}],
    "cited": true,
    "recalled": 0,
    "notes_captured": [],
    "memory_id": null,
    "seconds": 27.4,
    "rounds": 1
  }
}
```

| `zypher` field | Meaning |
|---|---|
| `sampling` | Profile used |
| `live` | Answer is about the present (searched or should have) — not stored |
| `sources` | Cited sources if any `[n]` appears in the answer, else all fetched |
| `cited` | Whether the answer cites any source |
| `recalled` | Number of past exchanges placed in the prompt |
| `notes_captured` | Notes captured from this question |
| `memory_id` | Id of the stored exchange (use with `/rate`), or `null` |
| `seconds` | Generation time |
| `rounds` | `generate()` calls used (auto-continue) |

`finish_reason: "length"` means the budget was hit; resend with the partial
answer as the last assistant message to continue.

**Response (`stream: true`)** — `text/event-stream`:

```
data: {"id":"chatcmpl-..","object":"chat.completion.chunk","created":..,"model":"zephyr-7b","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {..."choices":[{"index":0,"delta":{},"finish_reason":null}],"zypher":{"stage":"searching"}}

data: {..."choices":[{"index":0,"delta":{},"finish_reason":null}],"zypher":{"stage":"recalled","count":2}}

data: {..."choices":[{"index":0,"delta":{"content":"The "},"finish_reason":null}]}

data: {..."choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{...},"zypher":{...}}

data: [DONE]
```

A failure mid-stream is sent as `data: {"error": {"message": "..."}}` followed by `data: [DONE]`.
Disconnecting stops generation at the next token.

**Errors**

| Status | When |
|---|---|
| 400 | No user message, or last user message empty |
| 401 | Bad or missing API key |
| 422 | Body fails validation |
| 500 | Model failed to load (`"model failed to load: ..."`) |
| 503 | Model still loading, or `"out of GPU memory -- send less history or lower max_tokens"` |

---

### 5.8 `GET /v1/memory`

**Response 200**

```json
{
  "stats": {
    "ready": true,
    "enabled": true,
    "total": 42,
    "notes": 5,
    "exchanges": 37,
    "rated": 6,
    "encoder": "sentence-transformers/all-MiniLM-L6-v2",
    "dir": "D:\\GIT\\zypherLL\\.memory",
    "error": null
  },
  "profile": ["My name is Sneha", "I always use 4-space indentation"]
}
```

`stats` is `null` if memory is not initialised. `profile` is the list of notes
currently placed in the system prompt (≤ 8, name first). **503** if memory is
not initialised yet.

### 5.9 `GET /v1/memory/records`

**Query**

| Param | Type | Default | Notes |
|---|---|---|---|
| `kind` | `note` \| `exchange` | all | Filter |
| `limit` | int | 50 | Page size |
| `offset` | int | 0 | Start index |

**Response 200**

```json
{
  "total": 37,
  "records": [
    {"id": 42, "ts": "2026-09-23T10:15:02+05:30", "kind": "exchange",
     "q": "How do I sort a dict by value?", "a": "...", "score": 1, "uses": 3}
  ]
}
```

Record fields: `id`, `ts` (ISO-8601 with offset), `kind`, `q` (question; notes
use `"About the user"`), `a` (answer or note text), `score` (rating), `uses`.

### 5.10 `POST /v1/memory/notes`

Same as `/remember <fact>`.

**Request** — `{"text": "I prefer tabs over spaces"}` (1–200 chars)

**Response 200** — the stored record (`kind: "note"`). A near-duplicate note
replaces the existing one.
**503** — memory off or unavailable. **422** — text empty or too long.

### 5.11 `POST /v1/memory/{record_id}/rate`

Same as `/good` / `/bad`.

**Request** — `{"rating": "good"}` or `{"rating": "bad"}`

**Response 200** — the updated record. `good` adds 1 to `score`; `bad` sets
`score` to at most −1, which removes it from recall.
**404** — `"no memory with id N"`. **503** — memory not ready.

### 5.12 `DELETE /v1/memory?selector=...`

Same as `/forget`.

| `selector` | Removes |
|---|---|
| `last` (default) | The most recently stored record |
| `all` | Everything |
| any other text | Every record with similarity ≥ `RECALL_THRESHOLD` (0.42) to the text |

**Response 200** — `{"removed": 3}`

### 5.13 Postman

Import both files in `postman/`. Select the **zypherLL local** environment and
set `apiKey` to the value of `ZYPHER_API_KEY` (empty if the server runs without
a key). Chat requests save `zypher.memory_id` into `{{memoryId}}`; the Rate
requests use it.

### 5.14 OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="<ZYPHER_API_KEY>")
reply = client.chat.completions.create(
    model="zephyr-7b",
    messages=[{"role": "user", "content": "Explain Python decorators"}],
    stream=True,
    extra_body={"web": False, "sampling": "precise"},
)
for chunk in reply:
    print(chunk.choices[0].delta.content or "", end="")
```

---

## 6. Console commands

| Command | API equivalent | Does |
|---|---|---|
| `exit` / `quit` | — | Leave |
| `clear` | — (send fresh `messages`) | Reset the conversation; memory survives |
| `continue` | End `messages` with the partial assistant reply | Extend a truncated answer |
| `/tokens N` | `PATCH /v1/settings {"max_tokens": N}` | Answer budget |
| `/good` / `/bad` | `POST /v1/memory/{id}/rate` | Rate last answer |
| `/remember <fact>` | `POST /v1/memory/notes` | Store a note |
| `/forget last\|all\|<text>` | `DELETE /v1/memory?selector=` | Drop memories |
| `/memory` | `GET /v1/memory` | Show what has been learned |
| `/memory on\|off` | `PATCH /v1/settings {"memory": bool}` | Toggle recall |
| `/web` | `PATCH /v1/settings {"web": bool}` | Toggle web lookup |
| `/web <question>` | `"web": true` on a chat request | Force a lookup |

Unknown `/commands` are rejected rather than sent to the model.

---

## 7. Configuration

### 7.1 Environment (`.env` or shell; shell wins)

| Variable | Default | Purpose |
|---|---|---|
| `ZYPHER_API_KEY` | empty (no auth) | Bearer key for the API |
| `ZYPHER_HOST` | `127.0.0.1` | Bind address |
| `ZYPHER_PORT` | `8000` | Port |
| `ZYPHER_MODEL_PATH` | `C:\AI\Models\zephyr-7b-beta-abliterated` | Weights directory |
| `ZYPHER_MEMORY_DIR` | `<project>/.memory` | Memory store |
| `ZYPHER_EMBED_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Recall encoder |

Generate a key: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### 7.2 `zypher/config.py` (main settings)

| Setting | Default | Notes |
|---|---|---|
| `MAX_NEW_TOKENS` | 2048 | Per `generate()` call |
| `MAX_TOTAL_NEW_TOKENS` | 8192 (4096 < 8 GB) | Per answer, across auto-continue; runtime-mutable |
| `MAX_PROMPT_TOKENS` | 8192 (4096 < 8 GB) | Older turns dropped beyond this |
| `SAMPLING` | temp 0.3 / 0.6 / 0.85, `min_p` 0.05 | precise / balanced / creative |
| `REPETITION_PENALTY` | 1.05 | Answer tokens only |
| `STOP_STRINGS` | `<\|user\|>`, `<\|system\|>`, `<\|assistant\|>` | |
| `AUTO_CONTINUE` | `True` | Resume from KV cache at the per-call cap |
| `WARMUP` | `True` | Throwaway generation after load |
| `RETRIEVAL_ENABLED` / `MEMORY_ENABLED` | `True` / `True` | Runtime-mutable |
| `RECALL_KEEP` / `RECALL_THRESHOLD` | 3 / 0.42 | |
| `RECALL_CHAR_BUDGET` / `ANSWER_CHAR_BUDGET` | 1200 / 400 | |
| `PROFILE_MAX_NOTES` / `PROFILE_CHAR_BUDGET` | 8 / 600 | |
| `DEDUPE_THRESHOLD` | 0.94 | Note de-duplication |
| `MAX_RESULTS` / `FETCH_RESULTS` | 4 / 8 | Web snippets kept / requested |
| `CONTEXT_CHAR_BUDGET` / `SNIPPET_CHAR_BUDGET` | 3000 / 600 | |
| `TIME_LIMIT` | `"m"` | Last month; lifted for named past years |

---

## 8. Data storage

| Path | Content |
|---|---|
| `ZYPHER_MODEL_PATH/` | Model shards, tokenizer, verification cache |
| `.memory/memory.jsonl` | One JSON record per line (see 5.9) |
| `.memory/vectors.npy` | Embedding matrix, row-aligned with the records; rebuilt if it drifts |
| `.memory/meta.json` | Encoder metadata (rebuilds vectors when the encoder changes) |

Delete `.memory/` to start over. Nothing leaves the machine except search
queries, and only when a question needs the web.
