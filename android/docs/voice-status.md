# Voice and the wake word: status

Where the sixth part of the app stands after phases V1–V5, and the V6 check (20 Nov 2026). The
plan is `docs/aster-voice-plan.md`; section numbers below point into it, and its "V2–V5 as built"
notes list the differences from the plan that wait for confirmation.

## What's built

| Part | Where | State |
|---|---|---|
| Speech in / out | `modules/aster-system` (`SpeechInput.kt`, `SpeechText.kt`, `Speaker.kt`), `features/voice/speech.ts`, `sentences.ts` | Done (V1). Android's recognizer, on-device when the phone has one; TTS sentence by sentence with the chosen voice and speed. |
| Who may talk | `features/voice/access.ts`, 2.4's "Voice and wake word" | Done (V1). Not Guest; `voice_enabled` and chat on; answers at home with the model ready. |
| 3.6 Voice | `voice.tsx`, `VoiceScreen.tsx`, `turn.ts` | Done (V2). Listening / Paused, the orb, live words, streamed answer spoken, chips, mic, Switch to typing, Mute, follow-up listen. Opened from 3.1's mic, 3.4's "Talk instead", Reply by voice and "Hey Aster". |
| Voice chats | `chat/useChat.ts` | Done (V2). Ordinary chats with `context: ["voice"]`, uploaded through the queue. |
| Voice intents | `intents.ts`, `doing.ts` | Done (V3). Reminders (time, tomorrow, when I get home), reading missed messages (Owner; >3 summed up by the local model), replies after confirming, Stop. |
| Reply by voice (4.4) | `AlertNotifier.kt`, `voice.tsx` | Done (V3). The VIP notification's action opens 3.6 for the thread. |
| "Hey Aster" | `WakeRules.kt`, `WakeWord.kt`, `WakeWordService.kt`, `wake.ts`, `tools/wakeword/` | Built (V4). openWakeWord on ONNX Runtime in a microphone foreground service at home, with the ongoing notification, Pause 1 hour, locking, call and 3.6 holds, chime and full-screen intent. **`hey_aster.onnx` is not trained yet**: debug builds use openWakeWord's "hey jarvis" (never shipped); release builds have no wake word. |
| 5.1 Voice, Voice and speech | `(tabs)/settings.tsx`, `voice-settings.tsx`, `voices.ts` | Done (V5). |
| 3.2, 3.4 Read aloud, `voice_read` | `home/copy.ts`, `ChatView.tsx`, `readAloud.ts`, `doing.ts` | Done (V5). Laravel's `ActivityType` lists `voice_read`. |

Each phase has its own commit: plan, V1 (7930c90), V2 (e995115), V3 (c3ed4d3), V4 (7cad358),
V5 (b343185). No Laravel change was needed beyond `voice_read` in the `ActivityType` enum.

## Automated checks (20 Nov 2026)

- Typecheck and lint clean; Jest 456 tests in 52 suites pass.
- JUnit (`:aster-system:testDebugUnitTest`): `SpeechTextTest` (4), `AlertRulesTest` and
  `WakeRulesTest` (7) pass.
- The wake word pipeline, run in Python with the real models (`tools/wakeword/score.py`, the
  phone's exact steps): synthetic "Hey Jarvis" 0.998, other speech 0.0.
- Debug build for the phone: `gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`.

## Emulator check (20 Nov 2026)

Debug x86_64 build on the AVD `Medium_Phone_API_36.1` (Android 16) against Laravel
(`php artisan serve`, MySQL) and the test household (Owner "Phase Seven"), with zypherLL not
running (home mode "Home server not answering"):

- 5.1 Voice as drawn between "Home and location" and "Alerts and background": the switch, "At
  home, even with the screen off", "Voice and speech" with "Device voice · 1.0× · recognition on
  this phone".
- Voice and speech: "Phone default" and the AVD's voices ("English (US) 1–9", "English
  (Australia) …", "Hindi 1–5"; US first, the AVD's region); picking "English (US) 2" and 1.2×
  turned 5.1's row into "English (US) 2 · 1.2× · recognition on this phone"; Test played on the
  assistant stream.
- The wake word service: with the microphone allowed it runs in the foreground (type microphone)
  with "At home · listening for 1 VIP" / "Model ready · location on" and Pause 1 hour, Settings;
  Pause 1 hour turned it into "Paused until 10:58 AM" with Resume; Resume put it back. The
  status bar's microphone dot shows while it listens. ONNX Runtime's library loads (x86_64).

Fixed during the check: with the microphone never allowed (skipped at 1.5), the switch showed on
and nothing listened. 5.1 now says "Needs the microphone to listen" *(proposed)* with "Allow the
microphone" *(proposed)*, which asks (or opens the app's settings after a refusal for good) and
starts listening once allowed; checked on the AVD.

Second session, with zypherLL on Mark-L only (local model off, to save memory): 3.1 showed "At
home · Mark-L" with the mic on; 3.6 opened with "Voice · Phase Seven", the footnote and its three
buttons. Listening failed: the AVD's on-device recognizer (Android System Intelligence) and its
default one (Google TTS) both answer `LANGUAGE_PACK_ERROR` (code 13): no English speech pack was
ever downloaded on this AVD. Fixed:

- `SpeechInput.kt`: when the on-device recognizer has no pack (codes 12, 13) the same listen is
  tried once more with the phone's default recognizer, which is then used for the rest of the
  run (5.1 then says "recognition by Google"); `SpeechText.retryOffDevice` is JUnit-tested.
- If that one has no pack either, Android is asked to download it (`triggerModelDownload`,
  Android 13+; logcat showed `onTriggerModelDownload`) and 3.6 says "Speech recognition for your
  language isn't on this phone yet. Android is downloading it; try again in a few minutes."
  *(proposed)* instead of "isn't available on this phone".

The AVD never finished the download (8 tries over 4 minutes), so no spoken turn could be made on
it; real phones with Google's speech services have the pack, or fetch it. With 3.6 closed the
wake word service ran again; logcat held no token, password or PIN.

Noticed, not changed: the ongoing notification says "Model ready" (the canvas's line) even when
the home PC isn't answering. The AVD ran out of storage for a reinstall (`pm trim-caches` didn't
help); the app was uninstalled and set up again.

## Device check (§10)

The wake word and the recognizer need a real microphone, and battery and screen-off behaviour a
real phone. Each line below says how to check it.

| §10 item | State |
|---|---|
| 3.1's mic → 3.6; words live, streamed answer spoken; Mute; mic interrupts | Waiting for the phone |
| The turn in 3.3 and on Laravel with `context: ["voice"]` | Waiting for the phone (Jest covers the upload) |
| "Remind me to water the plants at 9" / "…when I get home"; Restricted told off | Waiting for the phone (Jest covers the parsing and saving) |
| "Read my missed messages from {name}" (Owner); others told; nothing uploaded | Waiting for the phone |
| Reply by voice opens 3.6 for the thread; sent only after confirming | Waiting for the phone |
| "Hey Jarvis" (debug) opens 3.6 at home, in the background and with the screen off; nothing away, locked, on a call, paused or switched off | Waiting for the phone |
| Ongoing notification while listening; Pause 1 hour | Done on the emulator (above) |
| 2.4's "Voice and wake word" off hides the mic and stops the wake word | Waiting for the phone (Jest covers both) |
| No audio or transcript in logcat or Metro's log | No token, password or PIN in logcat (emulator); transcripts need a spoken turn on the phone |
| Battery: an hour of listening with the screen off | Waiting for the phone |
| Typecheck, lint, Jest and JUnit pass | Done |

How to run it:

1. Phone on USB with debugging on; `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`,
   then `npm start` for Metro (the phone reaches it over Wi-Fi at the dev server URL in `.env`).
2. Sign in to the test household at home with the home PC's zypherLL running.
3. Battery: unplug, full screen-off hour at home with listening on, then
   `adb shell dumpsys batterystats --charged $ANDROID_PACKAGE` (the package in `.env`) (or Settings › Battery) for Aster's
   share; record it here.
4. Privacy: `adb logcat -d | grep -iE "aster|speech|wake"` after a few turns; there must be no
   words that were said or answered, no audio, no token.

## Open

- Train `hey_aster.onnx` (`tools/wakeword/train.sh`, home PC with WSL2, ~60 GB) and check it
  with `score.py` and on the phone; until then release builds have no wake word.
- The plan's "as built" notes (V2–V5) wait for confirmation.
