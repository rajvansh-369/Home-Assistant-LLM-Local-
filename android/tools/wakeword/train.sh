#!/usr/bin/env bash
# Trains the "hey aster" wake word with openWakeWord (docs/aster-voice-plan.md §6) and copies
# hey_aster.onnx into the Android module's assets. Meant for the home PC (NVIDIA GPU, Linux or WSL2,
# Python 3.10, ~60 GB free disk, 16 GB+ RAM). Takes several hours; every step is resumable.
#
#   ./train.sh setup      clone openWakeWord + piper-sample-generator, download data (~30 GB)
#   ./train.sh clips      generate and augment the synthetic clips
#   ./train.sh model      train and export hey_aster.onnx
#   ./train.sh install    copy it into modules/aster-system's assets
#   ./train.sh check FILE.wav   score a 16 kHz mono recording with the trained model
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${WAKEWORD_WORK:-$HERE/work}"
ASSETS="$HERE/../../modules/aster-system/android/src/main/assets/wakeword"
PY="${PYTHON:-python3}"
HF="https://huggingface.co/datasets/davidscripka/openwakeword_features/resolve/main"

mkdir -p "$WORK"
cd "$WORK"

setup() {
  [ -d venv ] || "$PY" -m venv venv
  # shellcheck disable=SC1091
  source venv/bin/activate
  [ -d openWakeWord ] || git clone --depth 1 https://github.com/dscripka/openWakeWord
  [ -d piper-sample-generator ] || git clone --depth 1 https://github.com/rhasspy/piper-sample-generator
  pip install -e ./openWakeWord
  pip install -r piper-sample-generator/requirements.txt
  pip install mutagen torchinfo torchmetrics speechbrain audiomentations torch-audiomentations \
    acoustics pronouncing datasets deep-phonemizer 'numpy<2'
  [ -f piper-sample-generator/models/en_US-libritts_r-medium.pt ] || \
    wget -O piper-sample-generator/models/en_US-libritts_r-medium.pt \
      https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/en_US-libritts_r-medium.pt
  # Negative features and the false-positive validation set (openWakeWord's).
  [ -f openwakeword_features_ACAV100M_2000_hrs_16bit.npy ] || \
    wget "$HF/openwakeword_features_ACAV100M_2000_hrs_16bit.npy"
  [ -f validation_set_features.npy ] || wget "$HF/validation_set_features.npy"
  # Room impulse responses and background audio, resampled to 16 kHz.
  "$PY" "$HERE/fetch_augmentation.py" "$WORK"
}

clips() {
  # shellcheck disable=SC1091
  source venv/bin/activate
  "$PY" openWakeWord/openwakeword/train.py --training_config "$HERE/hey_aster.yml" \
    --generate_clips --augment_clips
}

model() {
  # shellcheck disable=SC1091
  source venv/bin/activate
  "$PY" openWakeWord/openwakeword/train.py --training_config "$HERE/hey_aster.yml" --train_model
}

install() {
  local model="$WORK/output/hey_aster.onnx"
  [ -f "$model" ] || { echo "No $model yet: run ./train.sh model" >&2; exit 1; }
  mkdir -p "$ASSETS"
  cp "$model" "$ASSETS/hey_aster.onnx"
  echo "Copied to $ASSETS/hey_aster.onnx. Rebuild the app (gradlew assembleDebug)."
}

check() {
  # shellcheck disable=SC1091
  source venv/bin/activate
  "$PY" "$HERE/score.py" "$ASSETS" "${1:?a 16 kHz mono .wav}" hey_aster
}

case "${1:-}" in
  setup) setup ;;
  clips) clips ;;
  model) model ;;
  install) install ;;
  check) check "${2:-}" ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
