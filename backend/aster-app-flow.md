# Aster: Android app, Laravel and zypherLL (v2, 23 Sep 2026)

- Design canvas (25 artboards: flow, architecture, screens): https://claude.ai/artifact/9o4pyECfESN5n4YbcpZnj5
- Integration spec (tables, endpoints, zypherLL changes, flows): https://claude.ai/code/artifact/9f125718-f276-42cb-bd93-c8f45d7d2881
- Backend architecture (Laravel structure, data model, tokens and roles, zypherLL, deployment, tests, open questions): https://claude.ai/code/artifact/e30cef08-4983-43b6-8e96-346583bc02e6

"Aster" is a placeholder app name. Rohan (Owner), Meera (Member), Mom, Arjun and Neha are sample people. v1 of these notes assumed Ollama and on-phone storage; that no longer applies.

## Architecture
- The phone is the hub. It talks to a hosted Laravel API over HTTPS from anywhere, and to zypherLL (FastAPI, Zephyr 7B, port 8000 on the home PC) only on home Wi-Fi.
- Laravel can't reach the home network, so it never calls zypherLL. The phone uploads each finished chat to Laravel.
- zypherLL is served with `--host 0.0.0.0 --port 8000`. Port 8000 is allowed in Windows Firewall for Private networks only and never forwarded.

## Data ownership
- Laravel: household account, profiles and PIN hashes, chat history (encrypted), reminders, VIP rules and alert settings, home place, location history (30 days), activity log.
- zypherLL: answers, web lookups (DuckDuckGo), and memory in a separate folder for each profile.
- Phone: captured WhatsApp, Google Chat and SMS messages (not uploaded by default), alarms, home detection, offline upload queue.

## Tokens and privacy
- Owner signs in once and gets a device token (Sanctum). Unlocking a profile with a PIN returns a profile token plus a 12-hour llm_token. The llm_token is an RS256 JWT signed by Laravel, and zypherLL verifies it offline with Laravel's public key.
- The token's `scope` claim picks the memory folder. `web: never` covers Restricted and Guest profiles, and `memory: false` covers Guest.
- The zypherLL admin key (ZYPHER_API_KEY) never goes into the app, because it can read every profile's memory.
- Prompts that include captured messages are sent with `web: false` and `memory: false`.
- The model is abliterated, so Restricted profiles lose features instead of relying on a kid-safe prompt.

## zypherLL changes needed
1. A `caller` dependency that accepts the admin key or the Laravel JWT.
2. Memory per profile scope, sharing one encoder.
3. `DELETE /v1/memory/{record_id}`, because the selector delete removes everything similar.
4. Optional: `busy` in `/health`.

## Home mode
- The home geofence is set on the Set home map (150 m by default). On arrival the app checks the home Wi-Fi name and then `GET /health`. If ready, chat, voice and the wake word switch on and Aster offers a catch-up.
- Leaving the geofence, or losing home Wi-Fi for 2 minutes, switches back to Away.
- Away: reminders, message capture, location and (optionally) spoken alerts still work. Chat, summaries and memory need home.

## Location
- A point every 15 minutes (WorkManager) plus arrive and leave events, queued in Room, then `POST /api/locations/batch`.
- Owner-only, kept 30 days. Needs ACCESS_BACKGROUND_LOCATION ("Allow all the time").

## Screens (canvas numbering)
- 1.1 Welcome, 1.2 Sign in, 1.3 Create Owner, 1.4 Set home, 1.5 Permissions
- 2.1 Who's using?, 2.2 Unlock, 2.3 Profiles, 2.4 Edit profile, 2.5 Guest chat
- 3.1 Home, 3.2 Home away, 3.3 Chats, 3.4 Chat, 3.5 Web answer, 3.6 Voice
- 4.1 Messages, 4.2 Thread + AI reply, 4.3 Spoken alerts, 4.4 Notifications
- 5.1 Settings, 5.2 Memory and activity, 5.3 Location

## Build order
1. zypherLL token check and memory per profile.
2. Laravel sign-in, profiles, unlock and chat upload.
3. App home mode and streaming chat.
4. Places, locations and reminders.
5. Notification listener and spoken alerts.
6. Memory screen, location history screen and polish.
