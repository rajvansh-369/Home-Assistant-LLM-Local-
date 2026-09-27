# Aster home mode and chat in React Native: plan and phases

The second part of the app, after the first run (`docs/aster-first-run-plan.md`, done through
Phase 8 and Phase 7). This is step 3 of the build order in `../backend/aster-app-flow.md`:
profiles and unlock on every launch, home mode, streaming chat and the upload to Laravel.

Sources, in order of authority:

- Design canvas (screens 2.1, 2.5, 3.1–3.5): https://claude.ai/artifact/9o4pyECfESN5n4YbcpZnj5
- Integration spec (home mode, calling zypherLL, errors): https://claude.ai/code/artifact/9f125718-f276-42cb-bd93-c8f45d7d2881
- Laravel contract: `../backend/docs/aster-backend-plan.md` §4–§5 (built; routes in `../backend/routes/api.php`)
- zypherLL API: `../llm/README.md` "HTTP API" and "Mark-L engine"

Canvas strings are copied exactly. Strings the canvas doesn't have are marked *(proposed)*.
Canvas sample people and data (Rohan, Mom, Arjun, "Goa trip budget", …) are never defaults.

## Contents

1. Scope
2. Architecture
3. Components and tokens
4. Screens
5. Home mode
6. Chat with zypherLL
7. Chat history and the upload queue
8. Phases
9. Decisions to confirm
10. QA checklist

---

## 1. Scope

### In scope

- 2.1 Who's using, 2.2 Unlock for any profile, 2.5 Guest chat.
- Locking: the avatar on Home, the profile token's 12 h expiry, and "Lock when I leave"
  (the profile's `auto_lock_minutes`, 2 by default, in the background).
- Home mode: the Away / Checking / Loading / Ready / No server state, from home Wi-Fi, the home
  geofence and `GET /health`, as the integration spec's "Home mode" describes.
- 3.1 Home (at home), 3.2 Home away, 3.3 Chats, 3.4 Chat with 3.5's web answer parts.
- Streaming chat with zypherLL: the profile's engine (Local or Mark-L), stop, continue, sources,
  status chips, rating, the per-message web switch, private chats.
- Upload to Laravel: conversations and messages, queued on the phone until they get through.
- 5.1 Settings as a tab, with Switch profile and Lock added to the existing Assistant section.

### Out of scope (later steps)

- 3.6 Voice and the wake word; the mic buttons are left out until then.
- 4.x Messages, VIP alerts, catch-up and reply drafts, so no "Missed while you were away" card,
  "Listening" chip, Messages tab, "Read aloud" or "Summarize".
- Reminders ("Coming up"), 2.3 Profiles and 2.4 Edit profile ("Add profile"), 5.2 Memory, 5.3
  Location, location upload.
- Attachments ("Add a photo or file").

---

## 2. Architecture

### Routes (expo-router)

```text
src/app/
  index.tsx                  launch routing (§2 Launch routing)
  (first-run)/…              unchanged
  who.tsx                    2.1 Who's using
  unlock/[id].tsx            2.2 Unlock (profile mode)
  guest.tsx                  2.5 Guest chat
  (tabs)/_layout.tsx         bottom tab bar: Home, Chats, Settings
  (tabs)/home.tsx            3.1 / 3.2 (one route; the home-mode state picks the layout)
  (tabs)/chats.tsx           3.3 Chats
  (tabs)/settings.tsx        5.1 Settings (moved from settings.tsx)
  chat/[id].tsx              3.4 Chat; `new` starts one, `private` starts a private one
  dev/gallery.tsx            unchanged
```

The old `home.tsx` placeholder goes away; its dev-only facts and "Reset first run" move to the
bottom of 5.1 in `__DEV__`.

### State

| Store | Kept in | Holds |
|---|---|---|
| `useFirstRunStore` (exists) | AsyncStorage + SecureStore | server, Owner, home, first-run flags, engine names; in memory, `session`: the unlocked profile (from unlock or `/guest-sessions`: id, name, colour, role, personality, llm_engine, auto_lock_minutes), profile token, llm_token and expiry |
| `useHomeModeStore` (new) | memory only | home-mode state, last `/health`, Wi-Fi match, geofence inside, distance |
| `useChatStore` (new) | AsyncStorage, one key per profile | that profile's conversations and messages (cache) and its upload queue |
| `profiles` cache (new) | AsyncStorage | the `GET /profiles` list, so 2.1 opens offline |

Tokens stay in memory only, as in the first run. The first-run `session` field gains the unlocked
`profile` instead of a second store, so first run and 2.2 fill the same place and there is one
source for "who is unlocked". `llmEngineProfileId` (persisted) says whose choice `llmEngine` is.

### Launch routing

Rule 1 of the first-run table ("First run done → Home") becomes:

| # | State | Route |
|---|---|---|
| 1a | First run done, a profile is unlocked and its token hasn't expired | `/home` |
| 1b | First run done, otherwise | `/who` (2.1) |

Rules 2–7 are unchanged. A 401 on a profile-token call clears the session and replaces with
`/who`; a 401 on a device-token call signs out as before (§5 of the first-run plan).

### Services

- `src/services/api`: new calls in `types.ts`, `client.ts` and `mock.ts`: `guestSession`,
  `lockProfile`, `refreshLlmToken`, `getMe`, `updateMe`, `listConversations`,
  `createConversation`, `deleteConversation`, `listMessages`, `postMessages`, `updateMessage`.
- `src/services/llm/health.ts`: also reads `engines`, `busy` and `engine` from `/health`.
- `src/services/llm/chat.ts` (new): the streaming client (§6).
- `src/services/wifi.ts`: exists; also used by home mode.

---

## 3. Components and tokens

No new colours: the canvas screens use the §2 palette already in `src/theme/colors.ts`
(`surface`, `surface2`, `border`, `track` for user bubbles, `borderStrong` for dashed cards,
`warning*` for the loading banner). New sizes and text variants go in `src/theme`.

| Component | From | Notes |
|---|---|---|
| `TabBar` | 3.1 nav | 84 tall, `surface`, top border; each tab 60×30 icon pill (`accentTint` when active), label 12/700. Icons: House, MessageCircle, SlidersHorizontal. |
| `ProfileCard` | 2.1 | 2-column grid card, radius 24, 72 avatar, name 17/700, role line 13 muted with a lock icon; dashed variant for Guest. |
| `StatusChip` | 2.1 footer, 3.1 | 34–36 tall pill, pulse dot, mono 12 "At home · {model}" |
| `ScreenHeader` | 3.3, 3.4 | 60 tall: back, title + mono subtitle, trailing icon buttons |
| `IconButton` | 3.3, 3.4 | 44×44 round, transparent or `surface2` |
| `ChatBubble` | 3.4 | user: `track` fill, radius 20 20 6 20, max 82 % |
| `AssistantMessage` | 3.4, 3.5 | 24 orb + text column; status chip, sources, notes, rating row, Continue |
| `Composer` | 3.4 | 48 input pill ("Message Aster"), web chip, 44 send; disabled state for Away |
| `DateDivider` | 3.4 | mono 11 caps "Today" |
| `ConversationRow` | 3.3 | title 15/700, time mono 12, one-line preview 14 secondary |

Each goes into the dev gallery. Icons stay lucide at stroke 1.8.

---

## 4. Screens

### 4.1 2.1 Who's using

- Orb 48, "Who's using Aster?" (title), "Each profile has its own locked chats." (secondary).
- Grid of profiles from `GET /profiles` (cached; refreshed on open): Owner and Member/Restricted
  cards show the role ("Owner", "Member", "Restricted" *(proposed)*) with a lock icon; tap →
  2.2. Guest is the dashed card, "Guest" / "Nothing is saved"; tap → 2.5. "Add profile" is left
  out until 2.3.
- Footer `StatusChip` with the home-mode state (§5): "At home · {model} ready" when Ready;
  otherwise *(proposed)* "Away from home", "At home · model loading", "Home server not answering".
- Android back on 2.1 leaves the app (it's the root once first run is done).
- A 401 here (device token) signs out to 1.2 as in the first run.

### 4.2 2.2 Unlock (profile mode)

The first-run 2.2 screen with any profile: avatar, name, role badge, keypad, the same errors and
lockout. Back returns to 2.1. The fingerprint key shows only for the Owner, with the biometric PIN
this phone holds. Success opens the session (§2 State), refreshes the chat cache, and replaces
with `/home`.

### 4.3 2.5 Guest chat

`POST /guest-sessions`, then the chat screen in guest mode: header "Guest session" / "Nothing is
saved" with an "End" pill; callout "No history and no memory. Messages, reminders and other
profiles are hidden in Guest mode."; composer placeholder "Ask anything". Requests send
`memory: false`, `web: false`; nothing is cached or uploaded. End (or Android back) calls
`POST /profiles/{id}/lock` and replaces with `/who`. Away from home the composer is disabled as on
3.2.

### 4.4 3.1 Home (at home)

- Mono 12 date ("Wed, 23 Sep", from the phone's locale formatting of today), greeting "Good
  morning / afternoon / evening, {name}" (5–12, 12–17, otherwise), avatar 46 with a lock badge
  (label "Switch profile or lock") → locks and replaces with `/who`.
- Chip row: `StatusChip` "At home · {model}" (House icon) → Settings.
- Loading banner *(proposed)* "Model is loading. Chat opens when it's ready." while Loading;
  "Home server not answering. Trying again every minute." while No server.
- Suggestion chips (38 tall): "Plan tomorrow morning" (canvas) and *(proposed)* "Explain
  something simply", "Help me write a message". Tap → new chat with that question sent.
- Bottom composer entry: "Ask Aster anything" pill (56 tall) → new chat.
- Tab bar.

### 4.5 3.2 Home away

- Same header (no lock badge on the avatar in the canvas; keep the lock action on tap).
- Map card: a lite `MapView` 132 tall with the home circle and the phone's position when known;
  "Away from home · {km} km" (one decimal, "Away from home" alone without a position) and
  *(proposed until reminders and capture exist)* "Chat switches on when you get home."
- Composer: dashed "Chat is available at home", disabled; tab bar. Chats stay readable (history
  is read-only away).

### 4.6 3.3 Chats

- Header "Chats" with "Search chats" (filters titles locally) and "New chat".
- Privacy line: lock icon + "Only in {name}'s profile · saved to your server".
- "Start a private chat" card, "Not saved and not remembered" → `chat/private`.
- Sections "Today", "This week", "Earlier": title, time (time today, weekday this week, "15 Sep"
  earlier), first line of the last assistant message. Long-press → Delete *(proposed)*.
- Empty *(proposed)*: "No chats yet. Ask Aster anything from Home."
- Away: the list still opens; a chat opens read-only.

### 4.7 3.4 Chat and 3.5 web answer

- Header: back, title (the first question, trimmed), subtitle "{model} · home server"; "More
  options" → Delete chat *(proposed)*.
- "Today" divider, then messages. User: bubble. Assistant: orb + text, plus:
  - while streaming: "Searching the web" or "Used {n} memories" chip from `zypher.stage`;
  - web answers: "Searched the web · {n} results", numbered sources (title, domain, opens the
    link), and "Live answer, so it isn't saved to memory" when `live`;
  - rating (only when `memory_id` is set): "Good answer" / "Bad answer" thumbs and the note
    "Rated good · ranks higher next time" or "Rated bad · won’t be recalled";
  - "Continue" *(proposed)* when `finish_reason` is `length`;
  - an error line under a partial answer, keeping the text.
- Composer: "Message Aster", the web chip "Web: Auto" / "Web: Off" (hidden for Restricted and
  Guest, whose token never allows web), Send; while streaming Send becomes Stop *(proposed label
  "Stop")*. Disabled with the reason when Away, Loading or No server.
- Private chat: the banner "Private chat: not saved and not remembered" *(proposed)*.

### 4.8 5.1 Settings

Becomes the third tab. Adds, above the existing Assistant section, a profile row (avatar, name,
role) with "Switch profile" and "Lock" *(proposed)*. The dev facts and "Reset first run" move to
the bottom in `__DEV__`.

---

## 5. Home mode

```text
Away ──(on home Wi-Fi, or inside the home area)──▶ Checking
Checking ──ready──▶ Ready          Checking ──loading──▶ Loading ──(poll 10 s)──▶ Ready
Checking ──no reply in 3 s──▶ No server ──(retry every 60 s)──▶ Checking
Ready / Loading / No server ──(left the area, or off home Wi-Fi for 2 min)──▶ Away
```

- Signals: home Wi-Fi = the connected SSID equals the saved `wifi_ssid` (NetInfo; needs location
  permission). Inside = the last geofence event was "enter", or, in the foreground with location
  allowed, the phone is within `radius_m` of home. With no Wi-Fi name saved, the area alone
  counts.
- Checking calls `GET {llm_url}/health` (3 s, no token). Ready means the profile's engine is
  `ready` in `engines` (older servers without `engines`: `status`).
- Runs while the app is in the foreground (AppState), on NetInfo changes and geofence events.
  Background detection and the catch-up notification come with the Messages step.
- The model label: Local → the `/health` model id ("zephyr-7b"); Mark-L → its admin-panel name.

---

## 6. Chat with zypherLL

### Request

`POST {llm_url}/v1/chat/completions` with `Authorization: Bearer {llm_token}`:

```json
{
  "stream": true,
  "engine": "local | markl",
  "assistant_name": "Mark-L (markl only: the admin panel's name)",
  "messages": [
    { "role": "system", "content": "{personality, when the profile has one}" },
    "… the last 10 messages of this chat …",
    { "role": "user", "content": "{question}" }
  ],
  "web": "auto | false",
  "memory": true
}
```

- `web`: `"auto"` unless the chip says Off (then `false`); never sent `true`. The token's `web`
  claim still wins on the server.
- `memory`: `false` for private chats and Guest; otherwise left out (server default). The token's
  `memory` claim still wins.
- `sampling`, `max_tokens`: left out (automatic).

### Stream (server-sent events, OpenAI chunks)

| Event | App |
|---|---|
| chunk with `zypher.stage: "searching"` | "Searching the web" chip |
| chunk with `zypher.stage: "recalled"`, `count` | "Used {n} memories" |
| chunk with `zypher.stage: "tool"` (Mark-L) | "Using {tool}" *(proposed)* |
| `choices[0].delta.content` | appended to the answer |
| last chunk: `finish_reason`, `usage`, `zypher` | sources, `live`, `memory_id`, `recalled`, `seconds` |
| `{ "error": { "message" } }` | error line; the partial answer stays |
| `data: [DONE]` | end |

Transport: `fetch` from `expo/fetch` (streams the body; `AbortController` stops it). A pure
`parseSse` turns bytes into events and is unit tested.

### Errors (integration spec "Errors and offline behaviour")

| Situation | App |
|---|---|
| 401 | `POST /llm-token`, then retry once |
| 503 "Model is loading" / not ready | home mode back to Loading; "Model is loading" |
| 503 out of GPU memory | retry once with the last 4 messages and `max_tokens: 1024` |
| 429 (Mark-L quota) | "Mark-L is out of quota for now. Switch to Local in Settings." *(proposed)* |
| 502 | "Mark-L couldn't answer. Try again." *(proposed)* |
| No reply | "Home server not answering." and home mode re-checks |
| Stop | abort; save the partial answer with `finish_reason: "cancelled"` |
| `length` | Continue: the same messages plus the partial answer as the last assistant message; append; the uploaded message is PATCHed |
| `busy` in `/health` while sending | "Waiting for the model" *(proposed)* until the first token |

Rating: `POST /v1/memory/{memory_id}/rate` on zypherLL (local engine only), then
`PATCH /chat-messages/{id}` `{ rating }` through the queue.

---

## 7. Chat history and the upload queue

- Every chat has a `client_uuid` (a random v4 UUID made in JS: it is an idempotency key, not a
  secret, so no native crypto module and no new dev build), every message too. A chat is created
  on the phone with its first question; the title is that question trimmed to 60 characters.
- The phone keeps each profile's chats (the cache) under its own AsyncStorage key, so 3.3 opens
  offline and away. Private and Guest chats are never kept or uploaded.
- The queue holds jobs per profile: `createConversation`, `postMessages` (both messages of a
  turn, after the answer ends), `updateMessage` (rating, continue), `deleteConversation`. Jobs
  need that profile's token, so they run only while it is unlocked: after unlock, after each
  turn, when NetInfo comes back, and every 60 s in the foreground. Failures back off (5 s, 30 s,
  2 min, then every 5 min); a 422 drops the job and records why in the dev facts.
- 3.3 merges the cache with the full `GET /conversations` list (all pages): Laravel's list has no
  `server_time` to pass back as `since`, and a household's chat count is small. An uploaded chat
  missing from the list was deleted elsewhere and leaves the cache; chats not uploaded yet stay.
  Opening a chat that isn't cached loads `GET /conversations/{id}/messages`.
- Laravel ids come back from the uploads and are stored next to the `client_uuid`s, for PATCH and
  DELETE.

---

## 8. Phases

| Phase | Builds | Result |
|---|---|---|
| H1 | API calls, session store, route shell, components | Gallery shows the new components; tabs navigate |
| H2 | 2.1, 2.2 profile mode, locking, launch routing | Every launch goes through 2.1; auto-lock works |
| H3 | Home mode, 3.1, 3.2 | Home switches between at home and away on the device |
| H4 | Streaming client and prompt | Unit-tested SSE parsing, errors and retries |
| H5 | Chat store, upload queue, 3.3 | Chats list from cache and Laravel |
| H6 | 3.4 / 3.5 chat, 2.5 Guest | A streamed answer saved to Laravel |
| H7 | Device QA and status doc | §10 ticked or explained |

Each phase ends with typecheck, lint and Jest passing, and a commit.

---

## 9. Decisions to confirm

1. **Home detection runs in the foreground only** for now. The spec's "Home server not answering"
   notification and background checks come with the Messages step.
2. **"At home" = home Wi-Fi or inside the area**, then `/health`. With no Wi-Fi name saved, the
   area alone.
3. **The upload queue is JS in AsyncStorage**, flushed while the app is open and the profile is
   unlocked, instead of Room and WorkManager.
4. **Chat cache on the phone** is per profile in AsyncStorage (app-private, not encrypted). The
   server copy is encrypted at rest by Laravel.
5. **Tabs** are Home, Chats and Settings until Messages exists.
6. **Private chats** send `memory: false` and are neither cached nor uploaded; web lookups stay
   allowed.
7. **Engine per profile.** The Settings choice now saves with `PATCH /me` for whoever is unlocked;
   the first-run "pending until unlock" path stays for the Owner.
8. **Context sent** is the last 10 messages of the chat.
9. **Titles** are the first question, trimmed; no LLM-made titles.

---

## 10. QA checklist

- [ ] Launch after first run lands on 2.1; unlocking lands on Home; the avatar locks.
- [ ] "Lock when I leave": 2 minutes in the background returns to 2.1.
- [ ] Guest: nothing cached, nothing uploaded, End returns to 2.1.
- [ ] Home mode: Away without home Wi-Fi or area; Ready with `/health` ready; Loading polls every
      10 s; No server retries every 60 s.
- [ ] 3.2 shows the distance and a disabled composer; chats stay readable.
- [ ] A chat streams word by word with the profile's engine; Stop keeps the partial answer.
- [ ] Web answers show the searching chip, sources and "Live answer…".
- [ ] Rating calls zypherLL and reaches Laravel.
- [ ] Continue appears on `length` and extends the answer.
- [ ] Each finished turn reaches Laravel; with Laravel down it waits and goes out later.
- [ ] 3.3 lists chats grouped by day, from the cache offline, merged with Laravel online.
- [ ] 401 from zypherLL refreshes the llm_token once.
- [ ] No token, PIN or message text in the logs.
- [ ] Typecheck, lint and Jest pass; the flow works on the emulator against Laravel and zypherLL.
