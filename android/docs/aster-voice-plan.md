# Aster voice and the wake word in React Native: plan and phases

The sixth part of the app, after the first run, home mode with chat (H1–H7), reminders and location
(R1–R6), messages and spoken alerts (M1–M6) and profiles, memory and activity (P1–P6). Every earlier
plan left "3.6 Voice and the wake word" for later; this is it. The mic buttons on 3.1 and 3.4, the
notification's "Reply by voice", 2.4's "Voice and wake word" row, 5.1's Voice section and the
ongoing "At home · listening" notification come with it.

Sources, in order of authority:

- Design canvas (3.6 Voice; 3.1 Home's mic button; 3.4 Chat's "Talk instead"; 3.2 "Chat and voice
  switch on when you get home"; 4.4 "Reply by voice" and the ongoing "At home · listening for 3
  VIPs" notification; 5.1 Voice section; 2.4 "Voice and wake word"; the Flow's "Chat, voice and wake
  word switch on" and "read aloud in voice mode"; Architecture's "Wake word and spoken alerts" and
  "Speech-to-text and text-to-speech on the phone"): https://claude.ai/artifact/9o4pyECfESN5n4YbcpZnj5
- Integration spec ("Home mode" table: chat and voice answers at home only, "Hey Aster" off away;
  "Screens and their APIs": 3.6 Voice is the same as chat, speech on the phone):
  https://claude.ai/code/artifact/9f125718-f276-42cb-bd93-c8f45d7d2881
- Laravel contract: `profiles.voice_enabled` (backend commit "voice_enabled on profiles"), the
  conversation upload with a message `context` flag, `/reminders`; nothing else is needed.
- Wake word engine: openWakeWord (chosen 1 Oct 2026), https://github.com/dscripka/openWakeWord

Canvas strings are copied exactly. Strings the canvas doesn't have are marked *(proposed)*.
Canvas sample people and data (Rohan, Mom, "I'll call at 9", …) are never defaults.

## Contents

1. Scope
2. Architecture
3. Screens
4. Talking: speech in, answers out
5. Things Aster does by voice
6. The wake word
7. Running in the background
8. Phases
9. Decisions to confirm
10. QA checklist

---

## 1. Scope

### In scope

- 3.6 Voice: a full-screen voice turn — Listening / Paused, the orb, what you said in large type,
  the answer below it (also spoken), suggestion chips, the mic, "Switch to typing", "Mute Aster's
  voice", close. Opened by 3.1's mic, 3.4's "Talk instead", the wake word and "Reply by voice".
- Speech-to-text on the phone (Android's recognizer, on-device when the phone has one) and answers
  read aloud with the phone's TextToSpeech, sentence by sentence as they stream.
- Voice turns saved as ordinary chats (3.3) with a `voice` context flag, so they sync like typed
  ones; turns about captured messages stay private, as typed ones do.
- Things done by voice on the phone: reminders ("Remind me to call Mom at 9", "…when I get home"),
  reading missed messages ("Read my missed messages from Mom", Owner only), and replying to a
  message after confirming ("Say 'I'll call at 9'").
- The "Hey Aster" wake word with openWakeWord, at home only, also with the screen off, from a
  foreground service with the ongoing "At home · listening for 3 VIPs" notification
  (Pause 1 hour, Settings).
- 4.4: the VIP missed notification's "Reply" becomes the canvas's "Reply by voice" and opens 3.6
  for that thread.
- 5.1 Voice section: "Wake word 'Hey Aster'" (switch) and "Voice and speech" (device voice, speed,
  recognition) *(proposed sheet)*. 2.4: the "Voice and wake word" row (`voice_enabled`).
- Answers in 3.4 read aloud when the turn started by voice ("read aloud in voice mode").

### Out of scope (later steps)

- Voice for Guest (Laravel keeps `voice_enabled` off for Guest) and voice away from home (the
  model is at home; the integration spec has voice answers home-only).
- Speaker identification ("who is talking"): the unlocked profile is who talks (§9 decision 4).
- Cloud speech services; Hindi-only recognition. The recognizer's language follows the phone
  (en-IN on most Indian phones, which handles Hinglish words reasonably).
- 5.1's Assistant rows "Personality", "Web lookups", "Aster server" and "Home LLM" (separate
  polish step).

---

## 2. Architecture

```text
"Hey Aster" (openWakeWord, foreground service, at home)   3.1 mic / 3.4 "Talk instead" / Reply by voice
                     \                                       /
                      -> 3.6 Voice screen (JS) -> VoiceTurn
                          1. listen: SpeechRecognizer (native) -> partial + final text
                          2. route: phone intents (reminder, read messages, reply)  or  chat
                          3. answer: zypherLL stream (askZypher) -> text on screen
                          4. speak: TTS sentence by sentence (native Speaker), mute / stop
                          5. save: chat cache + upload queue (context "voice"), activity event
```

The wake-word service and the recognizer share the microphone, so the service pauses its
`AudioRecord` while a turn listens and resumes after the answer is spoken.

### Routes (expo-router)

```text
src/app/
  voice.tsx                  3.6 Voice (params: `thread` for Reply by voice, `chat` to continue one)
```

`aster://voice` opens 3.6 (the wake word's full-screen intent and the notification's Reply by voice
use it with `?thread={key}`).

### Native (`modules/aster-system/android`)

| File | Holds |
|---|---|
| `SpeechInput.kt` *(new)* | `SpeechRecognizer` (on-device recognizer on Android 12+ when available, else the default with `EXTRA_PREFER_OFFLINE`), partial and final results, errors, silence end |
| `SpeechText.kt` *(new, V1)* | pure rules JUnit tests: recognizer error codes to the app's kinds, the best result, speech rate range |
| `Speaker.kt` (exists) | adds: chosen voice, speech rate, a queue of sentences, `onDone` per utterance, stop |
| `WakeWord.kt` *(new)* | openWakeWord's pipeline on ONNX Runtime: 16 kHz mono 80 ms frames → melspectrogram model → embedding model → "hey aster" classifier; score threshold and a 2 s refractory |
| `WakeWordService.kt` *(new)* | foreground service, type `microphone`; owns `AudioRecord`; the ongoing notification; pause / resume for a turn; "Pause 1 hour" |
| `AsterSystemModule.kt` | the JS API below and events `onSpeechPartial`, `onSpeechResult`, `onSpeechError`, `onSpeakDone`, `onWakeWord` |
| `src/main/assets/wakeword/` | `melspectrogram.onnx`, `embedding_model.onnx` (openWakeWord's), `hey_aster.onnx` (ours, §6) |

New native dependency: `com.microsoft.onnxruntime:onnxruntime-android` (arm64 dev builds keep the
APK growth to a few MB). Manifest (config plugin): `FOREGROUND_SERVICE_MICROPHONE`,
`RECORD_AUDIO` (asked at 1.5 already), the service with `foregroundServiceType="microphone"`,
`USE_FULL_SCREEN_INTENT` for the wake word with the screen off.

JS API (as built in V1): `speechAvailability()`, `startListening(language, maxMs)` (returns the
listen's session), `stopListening()`, `cancelListening()`, `speakQueued(text, id)`,
`stopSpeaking()`, `listVoices()`, `setVoiceSettings(voice, rate)`; to come in V4:
`startWakeWord(config)`, `stopWakeWord()`, `pauseWakeWord(minutes)`, `isWakeWordRunning()`.

### JS

| Path | Holds |
|---|---|
| `src/features/voice/` | `settings.ts` (wake word on, voice, rate; per phone, AsyncStorage), `turn.ts` (the VoiceTurn state machine), `intents.ts` (reminder / read messages / reply parsing), `sentences.ts` (cut a stream into speakable sentences), `wake.ts` (when the service may run), `VoiceScreen.tsx`, `copy.ts`; as built in V2 also `mic.ts` (asks for the microphone with 1.5's flow when it was skipped) |
| `src/features/chat/` | voice turns use the same chat cache and queue; `context: ["voice"]` on their messages. As built in V2: `useChat` takes `voice` (the spoken system line, `max_tokens` 200, the flag) and `onText`, and `send` resolves with the finished turn |
| `src/components/` | the large orb with rings (3.6), a `MicButton` (3.1, 3.4) |

---

## 3. Screens

### 3.6 Voice

- Header: "Voice" · "{profile name}" in mono, and "Close voice" (×).
- State line: pulsing dot + "Listening", or "Paused. Tap the mic to talk."; while answering
  "Thinking…" *(proposed)* and "Speaking" *(proposed)*.
- The orb (230 rings, 106 core) breathing while listening, still while paused.
- What you said, in large type with quotes (the live partial result while you talk).
- The answer under it, as it streams; also spoken unless muted.
- Suggestion chips from the answer (§5): e.g. "Say '{reply}'" and "Not now" for a message reply,
  "Edit" for a reminder.
- Bottom: "Switch to typing" (opens 3.4 with this conversation), the mic ("Pause listening" /
  "Start listening"), "Mute Aster's voice".
- Footnote: "Say 'Hey Aster' any time, even with the screen off." when the wake word is on, else
  "Turn on 'Hey Aster' in Settings." *(proposed)*.
- Not at home with the model ready: "Voice works when you're home." *(proposed)* with Close; the
  mic stays off.
- After an answer is spoken, listening resumes once for a follow-up *(proposed: 8 s, then Paused)*.

### 3.1 / 3.2 / 3.4

- 3.1: the round mic button ("Talk to Aster") beside "Ask Aster anything", at home and when the
  profile's `voice_enabled` is on.
- 3.4: "Talk instead" (mic) inside the composer; opens 3.6 continuing that chat. Answers to voice
  turns show a small "Read aloud" *(proposed)* to replay.
- 3.2: body text "Chat and voice switch on when you get home. Reminders, message capture and
  location keep working." (canvas; replaces M4's version without voice).

### 4.4 Notifications

| Notification | Change |
|---|---|
| VIP missed (native) | "Reply" becomes "Reply by voice" (canvas), opening 3.6 for the thread |
| Ongoing (wake word service) *(new)* | "At home · listening for {n} VIPs" (or "At home · listening" *(proposed)* with no VIPs) / "Model ready · location on"; "Pause 1 hour", "Settings". Channel `listening` "Listening at home" *(proposed)*, silent, low importance |

### 5.1 Settings: Voice (profiles with `voice_enabled`)

- "Wake word 'Hey Aster'" / "At home, even with the screen off" — switch (phone setting).
- "Voice and speech" / "Device voice · 1.0× · recognition on this phone" → a sheet *(proposed)*:
  the phone's voices (from TextToSpeech, English and Hindi ones), speed 0.8× / 1.0× / 1.2×, "Test"
  (speaks one sentence), and "Recognition: on this phone" or "Recognition: Google" *(proposed)*.

### 2.4 Edit profile

- "Voice and wake word" switch under "{name} can use" (`voice_enabled`), hidden for Guest.

---

## 4. Talking: speech in, answers out

- Listening: `SpeechRecognizer` with partial results, the phone's language, up to 15 s; it ends on
  silence. No speech: "I didn't catch that." *(proposed)* and Paused.
- Asking: the transcript goes through `intents.ts` first (§5); otherwise it is a chat turn with
  `askZypher` (profile's engine, web as for typed chats, memory as the profile), with a short
  system line "Answer in two or three short spoken sentences." *(proposed)* and `max_tokens` 200.
- Speaking: `sentences.ts` cuts the stream at `.`, `?`, `!` or 200 characters; each sentence is
  queued to TTS as it completes, Markdown stripped (lists become sentences, links dropped). Mute
  stops speech and keeps the text. Interrupt: tapping the mic stops speaking and listens.
- Saving: a voice session is one chat ("{first words}" title), uploaded through the queue with
  `context: ["voice"]`. A voice turn about captured messages is private, like "Ask about it".
- Audio focus: transient may-duck while speaking (as spoken alerts); the recognizer gets exclusive
  focus; a call in progress means no listening and no speaking.

## 5. Things Aster does by voice

All parsed on the phone (the model can't create reminders or send messages). Each one shows what
will happen and acts only after confirmation, except reading out loud.

| Said | Done | Who |
|---|---|---|
| "Remind me to {X} at {time}" / "in {n} minutes / hours" / "tomorrow at {time}" / "when I get home" | A reminder card (title, when) with "Edit"; saved through the reminders queue; "Done. I'll remind you at 9:00 PM." | Not Restricted (no reminders) |
| "Read my missed messages" / "…from {name}" / "What did {name} say" | Unread captured messages read out (sender and text, newest last); at home with the model ready, more than 3 are summarised by the local engine first | Owner only |
| After a read-out or Reply by voice: "Reply {text}" / "Say {text}" / a chip "Say '{draft}'" | The reply draft shown, then "Send" by voice ("Send" / "Yes") or tap; sent through the source notification's Reply action (`sendReply`) | Owner only |
| "Stop" / "Cancel" / "Never mind" | Ends the turn | Everyone |

Times use the phone's time zone; "9" means the next 9:00 (AM before noon is past, else PM)
*(proposed rule)*. A reminder or reply turn also logs `reminder` / `reply_sent` activity as typed
ones do; a read-out logs `spoken_alert`-style `voice_read` *(proposed type)* with counts, no text.

## 6. The wake word

- Model: a custom "hey aster" classifier trained with openWakeWord's training notebook on the home
  PC (RTX 3060), with synthetic clips from Piper TTS (en, en-IN voices) and openWakeWord's negative
  data; the script and its notes live in `android/tools/wakeword/` *(proposed)*; the output
  `hey_aster.onnx` is committed into the module's assets. Until it exists, development uses
  openWakeWord's pre-trained "hey jarvis" behind a dev-only flag (never in a release build).
- Pipeline (Kotlin port of openWakeWord's `Model.predict`): 1280-sample frames → melspectrogram
  (ONNX) → 76-frame windows → embedding model (ONNX, 96-dim) → last 16 embeddings → classifier;
  fires above 0.5 *(tunable)*, then ignores 2 s. Runs on a background thread at about 12.5 Hz.
- When it runs: the profile is unlocked, `voice_enabled`, the 5.1 switch on, home mode ready, not
  on a call, not paused. It stops on leaving home, locking, sign-out or "Pause 1 hour".
- On "Hey Aster": a short chime *(proposed)*, the service pauses its recording, and 3.6 opens
  listening (a full-screen intent over the keyguard when the screen is off).

## 7. Running in the background

- Android 14+ doesn't let an app start a microphone foreground service from the background. So the
  service starts when Aster is opened at home (or from a notification tap: "Welcome home", the
  ongoing notification), and keeps running with the screen off until one of §6's stop reasons.
  Arriving home in the background posts "Welcome home" as today; tapping it starts listening.
- Battery: three small ONNX models every 80 ms; expected a few percent an hour (measured in V6).
  "Run in background" (unrestricted battery, 5.1) is needed so Android doesn't stop it.
- Auto-lock: the wake word needs an unlocked profile; when auto-lock ends the session, listening
  stops and the ongoing notification says "Locked. Open Aster to listen." *(proposed)* (§9
  decision 3).
- Privacy: audio never leaves the phone except as text in a chat turn; nothing is recorded; the
  service keeps no audio past the 2 s window it scores.

---

## 8. Phases

| Phase | Builds | Result |
|---|---|---|
| V1 | Plan; native speech input and the Speaker additions, JS bindings and events, voice settings store, `voice_enabled` in 2.4 and the guards | Unit-tested bindings (Jest mocks, JUnit for sentence and timing rules); a new dev build |
| V2 | 3.6 Voice with push-to-talk from 3.1 and 3.4; streaming answers spoken sentence by sentence; voice chats saved and uploaded | Talking to Aster at home |
| V3 | Voice intents: reminders, reading missed messages, replying with confirmation; 4.4 "Reply by voice" | Aster does things by voice |
| V4 | The "hey aster" model (training script, `hey_aster.onnx`), the Kotlin openWakeWord pipeline, the foreground service and the ongoing notification | "Hey Aster" at home, screen off too |
| V5 | 5.1 Voice section and the "Voice and speech" sheet, 3.2 copy, read aloud in 3.4, activity events | Voice settings as drawn |
| V6 | Device QA on a phone (not the emulator: no real mic or wake word there), battery check, status doc | §10 ticked or explained |

V2 as built (differences from §3 and §4, to confirm):

- 3.6's footnote ("Say 'Hey Aster' any time…") is left out until the wake word exists (V4).
- The follow-up listen ends on the recognizer's own silence timeout (about 5 s on most phones),
  not a fixed 8 s; a follow-up nobody answers just pauses, with no "I didn't catch that."
- The mic while Aster is thinking or speaking stops the answer (saved as stopped) and listens.
- 3.4's "Talk instead" is on saved chats only; private chats and "Ask about it" have no mic.
- 3.1's mic is dimmed and disabled, like the suggestions, while the model isn't ready.
- A refused microphone shows "Aster needs the microphone. Allow it in Settings." *(proposed)*,
  with "Open settings" when it was refused for good.
- Errors (quota, model loading, …) are shown under the answer and spoken, then 3.6 pauses.

V3 as built (differences from §3 and §5, to confirm):

- Intents are parsed on the phone in `intents.ts` (pure rules, unit-tested) and done in `doing.ts`;
  they never reach the chat or Laravel's conversations, so a voice session's saved chat holds only
  the questions the model answered. Reminders still upload through the reminders queue.
- "Remind me to {X}" with no time answers "When should I remind you? …" *(proposed)* and saves
  nothing. "tomorrow at {h}" without AM/PM is 7–11 AM, else 12–6 PM; "tonight" alone is 9 PM;
  "tomorrow morning" is 9 AM *(proposed rules)*. Titles keep the recognizer's capitals.
- The reminder card shows the title and its "Coming up" label with one chip, "Edit" (opens the
  reminder editor). Spoken: "Done. I'll remind you at 9:00 PM." / "…tomorrow at 9:00 AM." /
  "…on Friday at …" / "…when you get home." *(proposed variants)*.
- Reading missed messages out marks their chats read (as opening 4.2 does). "…from {name}" matches
  a VIP's name, the chat's title or a sender, word by word. More than 3 are summed up by the local
  engine (the catch-up prompt); if the model doesn't answer they are read out in full instead.
- "Reply …" / "Say …" is an intent only after a read-out of a single chat or Reply by voice;
  otherwise it is a chat question. The draft is confirmed with "Send" / "Yes" or the Send chip;
  "Not now" / "No" drops it and pauses; any other question drops it silently.
- Reply by voice (4.4): the native notification's action is "Reply by voice" and opens
  `aster://voice?thread={key}`. 3.6 waits for voice to be ready, reads that chat's unread messages
  out, offers "Say '{draft}'" + "Not now" when the local model drafts one, and listens. Away (or
  the model not ready) it shows "Voice works when you're home." with "Open the chat"
  *(proposed)* to 4.2; a profile without voice is sent straight to 4.2.
- `voice_read` activity is left for V5 (with the other activity events); `reply_sent` is logged by
  `sendReply` as for typed replies. No Laravel or admin-panel change was needed.

V4 as built (differences from §2, §6 and §7, to confirm):

- Native files: `WakeRules.kt` (the streaming pipeline as `WakeDetector` behind a `WakeModels`
  interface, JUnit-tested with stand-in models, and the lock rule), `WakeWord.kt` (ONNX Runtime
  1.20.0), `WakeWordService.kt`. The JS API is `startWakeWord(configJson)` (also hands new rules to
  a running service), `stopWakeWord()`, `pauseWakeWord(minutes)`, `resumeWakeWord()`,
  `holdWakeWord(hold)` and `wakeWordState()` (instead of `isWakeWordRunning`), with `onWakeWord`.
- `hey_aster.onnx` is not trained yet: `tools/wakeword/` has the config, `train.sh`, the
  augmentation download and `score.py` (the phone's exact steps in Python). Debug builds carry
  openWakeWord's "hey jarvis" in the module's `src/debug/assets` (CC BY-NC-SA, never released);
  release builds have no keyword model until ours exists, so the service doesn't start there.
  The pipeline was checked in Python on synthetic speech: "Hey Jarvis" 0.998, other speech 0.0.
- It runs while the profile is unlocked with voice, the 5.1 switch is on (default on; the switch
  itself comes in V5) and home mode is at home (any at-home state, not only "model ready", so a
  model reload doesn't stop a service that can't restart from the background). Leaving home also
  stops it natively from `setAtHome(false)`, which the headless geofence task calls.
- Locking: the service gets the session's token expiry and "Lock when I leave" minutes and locks
  itself in the background, keeping its notification with "Locked. Open Aster to listen.";
  locking in the app (or sign-out) stops it.
- Heard with Aster in front: an `onWakeWord` event opens `/voice?wake=1`. Otherwise a high-priority
  notification "Hey Aster" / "Tap to talk to Aster." *(proposed)* with a full-screen intent (opens
  3.6 over the lock screen when the screen is off; a heads-up otherwise). A short system chime
  plays first. The microphone stays released for 30 s unless 3.6 takes it.
- 3.6 holds the microphone while open (the service records nothing) and gives it back on close.
  Paused shows "Paused until {time}" *(proposed)* with "Resume" *(proposed)* in place of
  "Pause 1 hour". No recording during a call.
- 3.6's footnote "Say 'Hey Aster' any time, even with the screen off." shows while the wake word
  setting is on.

V5 as built (differences from §3 and §5, to confirm):

- 5.1's Voice section sits between "Home and location" and "Alerts and background", as drawn, for
  every profile that may use voice (`voiceAllowed`: not Guest, `voice_enabled` and chat on). "Wake
  word 'Hey Aster'" is the per-phone switch (wake.ts starts or stops the service at once); a build
  without the "hey aster" model says "Not in this version of Aster yet" *(proposed)* under it.
  "Voice and speech" shows "{voice} · {speed} · {recognition}", e.g. "Device voice · 1.0× ·
  recognition on this phone", or "…recognition by Google" *(proposed)* when the phone has no
  on-device recognizer.
- "Voice and speech" is a screen (`/voice-settings`, like 4.3), not a sheet: the app has no sheet
  pattern yet. It lists "Phone default" and the phone's offline English and Hindi voices, named by
  language and numbered within it ("English (India) 1", "Hindi 1"; Android's own names mean
  nothing to people), the phone's region first; speed 0.8× / 1.0× / 1.2×; "Test" says "Hi, I'm
  Aster. This is how I sound." *(proposed)*; and "Recognition: on this phone" / "Recognition:
  Google" / not available.
- 3.2: profiles that may use voice get the canvas's "Chat and voice switch on when you get home. …";
  the others keep "Chat switches on …" (the canvas line names voice they don't have). The mic stays
  hidden away (decision 8), not drawn disabled as on the canvas.
- 3.4: an answer whose question was asked in 3.6 (the `voice` flag) has "Read aloud" *(proposed)*,
  "Stop reading" while it is read; one answer at a time, with 5.1's voice and speed; leaving the
  chat stops it. Answers are not read aloud by themselves in 3.4.
- Activity: reading missed messages out (a read-out, a summary of many, or Reply by voice's
  read-out) logs `voice_read` with "Read out {n} missed messages" *(proposed)*, "… from {VIP}" when
  they were all one VIP's (a non-VIP stays unnamed, as for `reply_sent`) and meta `messages`,
  `chats`, `summed`; never the text. Voice reminders log nothing new: typed reminders don't either
  (`reminder_fired` comes when they ring). Laravel's `ActivityType` enum gains `voice_read` for
  the admin panel's filter; 5.2 shows it with a mic.

Each phase ends with typecheck, lint, Jest (and JUnit for native rules) passing, and a commit.
V1 and V4 need a new dev build (`gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` for
the phone).

---

## 9. Decisions to confirm

1. **Speech recognition is Android's own**, on-device where the phone supports it ("recognition on
   this phone"), no cloud API key; audio isn't uploaded anywhere by Aster.
2. **The wake word is openWakeWord with our own "hey aster" model**, trained on the home PC; a
   pre-trained "hey jarvis" stands in during development only.
3. **The wake word needs an unlocked profile.** Locked, the service stops listening and says so in
   its notification; it doesn't open a voice session for someone unknown. (Alternative: keep
   listening and open 2.2 Unlock on "Hey Aster".)
4. **Whoever is unlocked is who talks**; no voice identification.
5. **The service starts only from the app or a notification tap** (Android 14+ rule), not by
   itself on arrival.
6. **Voice chats are ordinary chats** with a `voice` flag; voice turns about captured messages are
   private and never uploaded.
7. **Actions need confirmation**: reminders show their card first (saved at once, "Edit" to change),
   replies are sent only after "Send"/"Yes" or a tap.
8. **Voice is home-only**, like chat; away, 3.6 says so and the mic buttons are hidden.
9. **Wake word and voice settings are per phone** (AsyncStorage), except `voice_enabled`, which is
   the Owner's per profile on Laravel.

---

## 10. QA checklist

- [ ] 3.1's mic opens 3.6; speaking a question shows the words live, then the streamed answer,
      spoken sentence by sentence; Mute stops speech, the mic interrupts it.
- [ ] The turn appears in 3.3 Chats as a chat and reaches Laravel with `context: ["voice"]`.
- [ ] "Remind me to water the plants at 9" makes a reminder for the next 9:00 that rings;
      "…when I get home" makes an arrive-home one; Restricted is told reminders are off.
- [ ] "Read my missed messages from {name}" reads them out (Owner); others are told it's the
      Owner's; nothing is uploaded.
- [ ] "Reply by voice" on a missed notification opens 3.6 for that thread; the reply is sent only
      after confirming, through the source app.
- [ ] "Hey Aster" opens 3.6 at home with the app in the background and with the screen off; nothing
      happens away, locked, on a call, paused, or with the 5.1 switch off.
- [ ] The ongoing notification shows while listening; "Pause 1 hour" pauses it.
- [ ] 2.4's "Voice and wake word" off hides the mic and stops the wake word for that profile.
- [ ] No audio or transcript in logcat or Metro's log; an hour of listening uses an acceptable
      share of battery (recorded in the status doc).
- [ ] Typecheck, lint, Jest and JUnit pass; the flows work on a phone against Laravel and zypherLL.
