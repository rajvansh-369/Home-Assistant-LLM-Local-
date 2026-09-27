# Home mode and chat: status

Where the second part of the app stands after phases H1–H7 (27 Sep 2026). The plan is
`docs/aster-home-chat-plan.md`; section numbers below point into it.

## What's built

| Screen | Route | State |
|---|---|---|
| 2.1 Who's using | `who` | Done. Profiles from `GET /profiles`, cached for offline; Owner first, dashed Guest card last; home-mode chip. "Add profile" waits for 2.3. |
| 2.2 Unlock, profile mode | `unlock/[id]` | Done. The first-run keypad screen as a shared `UnlockView`; fingerprint key for the Owner only. |
| 2.5 Guest chat | `guest` | Done. Memory and web off, nothing kept or uploaded; End or back locks and returns to 2.1. |
| 3.1 Home / 3.2 Home away | `(tabs)/home` | Done. Date and greeting, avatar lock, status chip, loading / no server / failed banner, suggestions, "Ask Aster anything"; away: lite map with the home area and the phone, distance, disabled composer. |
| 3.3 Chats | `(tabs)/chats` | Done. Today / This week / Earlier, previews, search, private chat, delete on long-press, "not on the server yet" mark. |
| 3.4 / 3.5 Chat | `chat/[id]` | Done. Streaming, status chips, Stop, Continue, sources, live note, rating, web switch, private mode, Markdown. |
| 5.1 Settings | `(tabs)/settings` | A tab now: profile row with Lock, the engine picker, dev facts at the bottom in dev builds. |

Around the screens: launch routing (1a `/home` while unlocked, 1b `/who`), the session carrying
the unlocked profile, auto-lock, home mode (`src/features/home-mode`), the zypherLL streaming
client (`src/services/llm/chat.ts`, `sse.ts`), and the per-profile chat cache with its upload
queue (`src/features/chat`).

Each phase has its own commit: H1 (API calls, tabs, components), H2 (profiles, unlock, Guest,
locking), H3 (home mode, Home), H4 (streaming client), H5 (chat cache, queue, Chats), H6 (chat
screen, Guest chat), H7 (this device check and its fixes).

## Device check (27 Sep 2026)

x86_64 debug build on the Android 16 emulator; Laravel from `php artisan serve` on port 8000;
zypherLL from `python main.py serve --port 8001` with `ZYPHER_LOCAL_MODEL=off` (no room for Zephyr
next to the emulator), so Local was **off** and Mark-L (Gemini) **ready**, with the JWT path on
(`ZYPHER_JWT_PUBLIC_KEY` = Laravel's public key, `ZYPHER_HOUSEHOLD_ID=h28`). Home Wi-Fi on the
emulator is "AndroidWifi". Household: the Owner on Mark-L, a Member on Local, and Guest.

- Sign-in to the existing household → 2.2 (first-run mode) → 1.4 prefilled with the LLM address
  from Laravel → Save → Skip → 3.1: "At home · Mark-L" (Ready although the PC's default engine is
  off).
- A 3.1 suggestion opened 3.4 and sent itself: "Thinking…", Stop while streaming, then the answer
  word by word. The phone's llm_token (RS256, Laravel-signed) was accepted by zypherLL. The turn
  reached Laravel (conversation and both messages, `finish_reason: stop`, `seconds`).
- A follow-up that needed the web showed "Searching the web" mid-stream, then the answer and
  "Live answer, so it isn't saved to memory".
- 3.3 listed the chat under Today with the time and the answer's first line.
- Lock (Settings) → 2.1 with the three cards and "At home · Mark-L ready".
- Member unlock → 3.1 "Home model failed to load" with zypherLL's reason (Local is off). Picking
  Mark-L in Settings saved it with `PATCH /me` ("Saved.") and home mode turned Ready at once. The
  Member's Chats were empty: the Owner's chats never load for another profile.
- Guest: the canvas layout; its engine (Local) is off, so the composer says "The home model didn't
  load"; End returned to 2.1.
- Owner unlocked, app in the background for about 2½ minutes → back at 2.1 ("Lock when I leave").
- Nothing sensitive in the JS log (no token, PIN, password or llm_token).

### Found and fixed during the check

- **1.4 Test judged only the PC's default engine.** With Zephyr off it said "Model failed to load"
  though the Owner's Mark-L was ready. `healthForEngine` now reads `/health`'s `engines` for the
  Owner's engine ("Ready · Mark-L"), and failed results keep their round-trip time.
- **Home mode and the chip used the last profile's engine for Guest.** Guest has its own engine
  (from Laravel) and no Settings; `activeEngineOf` now picks it for home mode, the chip and chat,
  and home mode re-checks when the unlocked profile changes.
- **A model that is off read as "loading".** A 503 now shows zypherLL's reason unless it's really
  loading, and the composer says "The home model didn't load" for a failed engine instead of "not
  answering".
- **Markdown showed raw** (`* **07:00**`). Answers now render paragraphs, bullet and numbered
  lists, headings, bold and code (`MarkdownText`).
- **The 2.1 status chip was left-aligned**; it's centred as on the canvas.

Screenshots: `docs/screens/home-chat/`.

## Decisions as built (plan §9)

1. Home detection runs in the foreground only (AppState, NetInfo, geofence events, timers).
2. Home = home Wi-Fi or inside the area, then `/health` for the profile's engine.
3. The upload queue is JS in AsyncStorage, flushed while the profile is unlocked.
4. Chats are cached per profile (`aster.chats.p{id}`), app-private, not encrypted on the phone.
5. Tabs: Home, Chats, Settings.
6. Private chats send `memory: false` and are never kept or uploaded; web stays allowed.
7. The engine is per profile; Settings saves it with `PATCH /me`.
8. The prompt carries the profile's personality and the last 10 messages.
9. Titles are the first question, cut at a word near 60 characters.

Also: client UUIDs are made in JS (no native crypto module, no new dev build); 3.3 merges
Laravel's whole list (it has no `server_time` for `since`); Guest ends after 2 minutes in the
background too.

## Known gaps

- Zephyr (Local) itself wasn't run: a 7B model doesn't fit next to the emulator here. Local's
  streaming, `memory_id` and rating were checked only in tests against the real SSE format. Try it
  on a PC with the model loaded.
- Rating and sources weren't seen on the device: Mark-L returns no `memory_id` and no `sources`
  (its search results come back inside the answer). Both are covered by tests.
- Continue and Stop were checked in tests; on the device only Stop's button state was seen.
- No background home detection, no "Home server not answering" notification (Messages step).
- The upload queue only runs while the app is open and that profile is unlocked.
- On Windows, `php artisan serve`'s first request after a while can take 8–10 s, longer than the
  5 s server check; leaving the field checks again (fixed in Phase 7).
- The emulator's Expo dev-tools bubble sits over the top-right corner (avatar, More options, End);
  dev builds only.
- Italic in Markdown shows as plain text (no italic font is loaded).
- 2.3 Profiles / 2.4 Edit profile, reminders, Messages, voice and memory screens are later steps.

## How to run against real servers

```bash
# Laravel (MySQL running)
cd ../backend && php artisan serve --port=8000
# zypherLL; with Mark-L only: ZYPHER_LOCAL_MODEL=off. For phones' llm_tokens set
# ZYPHER_JWT_PUBLIC_KEY=../backend/storage/keys/aster-jwt.pub and ZYPHER_HOUSEHOLD_ID=h<user id>.
cd ../llm && python main.py serve --host 0.0.0.0 --port 8001
# App: EXPO_PUBLIC_USE_MOCK_API=0; on the emulator the server is http://10.0.2.2:8000 and the
# home LLM http://10.0.2.2:8001 (set at 1.4). Restart Metro with --clear after .env changes.
npx expo start --dev-client --clear
```
