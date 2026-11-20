# The "Hey Aster" wake word

How the app's wake word model is made (docs/aster-voice-plan.md §6, phase V4).

## What the phone runs

`modules/aster-system/android/src/main/assets/wakeword/` holds three ONNX models, run by
`WakeWord.kt` / `WakeDetector` (`WakeRules.kt`) on every 80 ms of audio:

| File | From | Does |
|---|---|---|
| `melspectrogram.onnx` | openWakeWord v0.5.1 release | 1760 samples → 8 × 32 mel frames |
| `embedding_model.onnx` | openWakeWord v0.5.1 release | 76 mel frames → a 96-value embedding |
| `hey_aster.onnx` | **trained here** | the last 16 embeddings → score 0–1 (fires at 0.5) |

Until `hey_aster.onnx` exists, **debug builds only** carry openWakeWord's pre-trained
`hey_jarvis_v0.1.onnx` in `src/debug/assets/wakeword/`: say "Hey Jarvis" to test. Release builds
have no keyword model until this one is trained, so the service never starts in them
(`wakeWordState().error === 'models'`).

Licences: openWakeWord's code and feature models are Apache 2.0; its pre-trained keyword models
(hey_jarvis) are CC BY-NC-SA 4.0 — fine for development, not to ship. A model trained here on
Piper's synthetic speech is ours.

## Training (home PC, a few hours)

Needs Linux or WSL2, Python 3.10, an NVIDIA GPU (the RTX 3060 is plenty), ~60 GB of disk and
16 GB+ of RAM. Close the emulator and Metro first.

```bash
cd android/tools/wakeword
./train.sh setup     # clones openWakeWord + piper-sample-generator, downloads ~30 GB of data
./train.sh clips     # ~50k synthetic "hey aster" clips, augmented with rooms and noise
./train.sh model     # trains; writes work/output/hey_aster.onnx
./train.sh install   # copies it into the module's assets
```

`hey_aster.yml` is the training config: the phrase, the near-miss phrases that must not fire,
sample counts and the target of 0.2 false accepts per hour. `WAKEWORD_WORK` moves the work
folder (default `tools/wakeword/work`, which git ignores).

## Checking a model

Record yourself saying "Hey Aster" a few times (16 kHz mono 16-bit .wav), then:

```bash
./train.sh check me.wav                        # the trained model
python score.py ../../modules/aster-system/android/src/main/assets/wakeword me.wav \
  ../../modules/aster-system/android/src/debug/assets/wakeword/hey_jarvis_v0.1.onnx
```

`score.py` runs exactly the phone's streaming steps, so a score here is the score on the phone.
On the phone, 3.6 opens when the score passes 0.5; then it ignores the wake word for 2 s.
