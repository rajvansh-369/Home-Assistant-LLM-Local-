"""Scores a 16 kHz mono 16-bit .wav with the app's wake word models, frame by frame, exactly as
WakeDetector (modules/aster-system/.../WakeRules.kt) does on the phone.

Usage: python score.py ASSETS_DIR FILE.wav [KEYWORD]
  ASSETS_DIR holds melspectrogram.onnx and embedding_model.onnx (the module's src/main/assets/wakeword)
  KEYWORD is a name in ASSETS_DIR (default hey_aster) or a path to a .onnx classifier, e.g. the
  debug stand-in src/debug/assets/wakeword/hey_jarvis_v0.1.onnx.

Prints the best score and when it happened; the phone fires at 0.5.
"""
import sys
import wave

import numpy as np
import onnxruntime as ort

FRAME, CONTEXT, WINDOW, EMBEDDINGS, WARMUP = 1280, 480, 76, 16, 5


def main(assets, wav, keyword="hey_aster"):
    def session(name):
        path = name if name.endswith(".onnx") else f"{assets}/{name}.onnx"
        return ort.InferenceSession(path, providers=["CPUExecutionProvider"])

    mel_s, emb_s, kw_s = session("melspectrogram"), session("embedding_model"), session(keyword)
    with wave.open(wav) as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            sys.exit("Needs 16 kHz mono 16-bit audio")
        audio = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    audio = np.concatenate([np.zeros(16000, np.int16), audio, np.zeros(16000, np.int16)])

    tail = np.zeros(CONTEXT, np.float32)
    mel = [np.ones(32, np.float32)] * WINDOW
    embeddings, frames, best, best_at = [], 0, 0.0, 0.0
    for start in range(0, len(audio) - FRAME + 1, FRAME):
        x = np.concatenate([tail, audio[start:start + FRAME].astype(np.float32)])
        tail = x[-CONTEXT:]
        m = mel_s.run(None, {mel_s.get_inputs()[0].name: x[None]})[0][0, 0] / 10 + 2
        mel = (mel + list(m))[-WINDOW:]
        e = emb_s.run(None, {emb_s.get_inputs()[0].name: np.array(mel, np.float32)[None, :, :, None]})
        embeddings = (embeddings + [e[0][0, 0, 0]])[-EMBEDDINGS:]
        frames += 1
        if len(embeddings) < EMBEDDINGS or frames <= WARMUP:
            continue
        score = float(kw_s.run(None, {kw_s.get_inputs()[0].name: np.array(embeddings, np.float32)[None]})[0][0, 0])
        if score > best:
            best, best_at = score, (start - 16000) / 16000
    print(f"best score {best:.4f} at {best_at:.2f} s ({'fires' if best >= 0.5 else 'does not fire'})")


if __name__ == "__main__":
    main(*sys.argv[1:4])
