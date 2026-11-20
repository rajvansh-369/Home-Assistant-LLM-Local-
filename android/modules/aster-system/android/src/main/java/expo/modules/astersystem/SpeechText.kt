package expo.modules.astersystem

/**
 * Pure rules for speech input and output (docs/aster-voice-plan.md §4), kept free of Android
 * classes so JUnit can run them: what a recognizer error means to the app, and which of the
 * recognizer's results to keep.
 */
internal object SpeechText {
  /**
   * The app's names for `SpeechRecognizer.ERROR_*` codes (literal values: the constants live in
   * android.jar, which JUnit doesn't load).
   */
  fun errorKind(code: Int): String = when (code) {
    6, 7 -> "no-speech" // ERROR_SPEECH_TIMEOUT, ERROR_NO_MATCH
    9 -> "permission" // ERROR_INSUFFICIENT_PERMISSIONS
    8, 10 -> "busy" // ERROR_RECOGNIZER_BUSY, ERROR_TOO_MANY_REQUESTS
    1, 2, 4, 11 -> "network" // NETWORK_TIMEOUT, NETWORK, SERVER, SERVER_DISCONNECTED
    12, 13 -> "language" // LANGUAGE_NOT_SUPPORTED, LANGUAGE_UNAVAILABLE
    3 -> "audio" // ERROR_AUDIO
    5 -> "cancelled" // ERROR_CLIENT: what stopListening and cancel lead to
    else -> "failed"
  }

  /**
   * The on-device recognizer can't do this language (its pack isn't installed: codes 12, 13), so
   * the listen is tried again with the phone's default recognizer.
   */
  fun retryOffDevice(code: Int, onDevice: Boolean): Boolean = onDevice && (code == 12 || code == 13)

  /** The best of the recognizer's alternatives: the first non-blank one, trimmed and collapsed. */
  fun best(results: List<String>?): String =
    results.orEmpty().map { it.trim().replace(Regex("\\s+"), " ") }.firstOrNull { it.isNotEmpty() }
      ?: ""

  /** Speech rates the app offers (5.1 "Voice and speech"); anything else is clamped into range. */
  fun clampRate(rate: Double): Float = rate.coerceIn(0.5, 2.0).toFloat()
}
