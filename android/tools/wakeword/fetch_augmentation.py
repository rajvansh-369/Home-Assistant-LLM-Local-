"""Downloads the augmentation audio openWakeWord's training notebook uses, at 16 kHz mono.

Usage: python fetch_augmentation.py WORK_DIR

- MIT room impulse responses   -> WORK_DIR/mit_rirs
- AudioSet balanced (1 part)   -> WORK_DIR/audioset_16k
- Free Music Archive (small)   -> WORK_DIR/fma
"""
import os
import sys

import numpy as np
import scipy.io.wavfile
from datasets import Audio, load_dataset
from tqdm import tqdm


def save(rows, out_dir, limit=None):
    os.makedirs(out_dir, exist_ok=True)
    for i, row in enumerate(tqdm(rows, desc=out_dir, total=limit)):
        if limit is not None and i >= limit:
            break
        path = os.path.join(out_dir, f"{i:06d}.wav")
        if os.path.exists(path):
            continue
        audio = row["audio"]["array"]
        scipy.io.wavfile.write(path, 16000, (np.clip(audio, -1, 1) * 32767).astype(np.int16))


def main(work):
    rirs = load_dataset("davidscripka/MIT_environmental_impulse_responses", split="train", streaming=True)
    save(rirs.cast_column("audio", Audio(sampling_rate=16000)), os.path.join(work, "mit_rirs"))

    audioset = load_dataset(
        "agkphysics/AudioSet", "balanced", split="train", streaming=True, trust_remote_code=True
    )
    save(audioset.cast_column("audio", Audio(sampling_rate=16000)), os.path.join(work, "audioset_16k"), 5000)

    fma = load_dataset("rudraml/fma", name="small", split="train", streaming=True, trust_remote_code=True)
    save(fma.cast_column("audio", Audio(sampling_rate=16000)), os.path.join(work, "fma"), 2000)


if __name__ == "__main__":
    main(sys.argv[1])
