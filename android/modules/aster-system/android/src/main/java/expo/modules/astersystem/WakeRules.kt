package expo.modules.astersystem

/**
 * The "Hey Aster" wake word (docs/aster-voice-plan.md §6): openWakeWord's streaming pipeline as
 * plain Kotlin, with the three ONNX models behind [WakeModels] so the buffering and the decision
 * are JUnit-tested without ONNX Runtime.
 *
 * Every 80 ms frame (1280 samples at 16 kHz, 16-bit mono): the last 1760 samples (the frame plus
 * 480 before it) → melspectrogram model → 8 frames of 32 mel bins, scaled `x / 10 + 2` as
 * openWakeWord does → the newest 76 mel frames → embedding model → one 96-value embedding → the
 * newest 16 embeddings → the "hey aster" classifier → a score from 0 to 1.
 */
internal interface WakeModels {
  /** Raw samples (16-bit values as floats) → mel frames of [WakeRules.MEL_BINS], unscaled. */
  fun mel(samples: FloatArray): Array<FloatArray>

  /** [WakeRules.MEL_WINDOW] scaled mel frames → one embedding of [WakeRules.EMBEDDING_SIZE]. */
  fun embed(window: Array<FloatArray>): FloatArray

  /** [WakeRules.EMBEDDINGS] embeddings → the wake word's score. */
  fun score(embeddings: Array<FloatArray>): Float
}

internal object WakeRules {
  const val SAMPLE_RATE = 16_000
  const val FRAME = 1_280
  const val MEL_CONTEXT = 480
  const val MEL_BINS = 32
  const val MEL_WINDOW = 76
  const val EMBEDDING_SIZE = 96
  const val EMBEDDINGS = 16

  /** Fires at or above this (plan §6, tunable). */
  const val THRESHOLD = 0.5f

  /** Ignores the wake word this long after it fired. */
  const val REFRACTORY_MS = 2_000L

  /** openWakeWord ignores the first predictions after a start; so do we. */
  const val WARMUP_FRAMES = 5

  /** openWakeWord's scaling of the melspectrogram model's output. */
  fun scaleMel(value: Float) = value / 10f + 2f
}

/**
 * Turns 80 ms frames into "heard it" decisions. Not thread-safe: one recording thread owns it.
 * [reset] after the microphone was released (a turn, a pause), so old audio never scores.
 */
internal class WakeDetector(
  private val models: WakeModels,
  private val threshold: Float = WakeRules.THRESHOLD,
  private val refractoryMs: Long = WakeRules.REFRACTORY_MS,
) {
  private val tail = FloatArray(WakeRules.MEL_CONTEXT)
  private val mel = ArrayDeque<FloatArray>()
  private val embeddings = ArrayDeque<FloatArray>()
  private var frames = 0
  private var lastFiredAt = Long.MIN_VALUE / 2

  /** The newest score (for tuning in debug builds). */
  var lastScore = 0f
    private set

  init {
    reset()
  }

  fun reset() {
    tail.fill(0f)
    mel.clear()
    // openWakeWord starts its mel buffer as ones.
    repeat(WakeRules.MEL_WINDOW) { mel.addLast(FloatArray(WakeRules.MEL_BINS) { 1f }) }
    embeddings.clear()
    frames = 0
    lastScore = 0f
  }

  /** One frame of exactly [WakeRules.FRAME] samples; true when the wake word was just heard. */
  fun process(frame: ShortArray, nowMs: Long): Boolean {
    require(frame.size == WakeRules.FRAME) { "A frame is ${WakeRules.FRAME} samples" }
    val input = FloatArray(WakeRules.MEL_CONTEXT + WakeRules.FRAME)
    tail.copyInto(input)
    for (i in frame.indices) input[WakeRules.MEL_CONTEXT + i] = frame[i].toFloat()
    input.copyInto(tail, 0, input.size - WakeRules.MEL_CONTEXT, input.size)

    for (row in models.mel(input)) {
      mel.addLast(FloatArray(WakeRules.MEL_BINS) { WakeRules.scaleMel(row[it]) })
    }
    while (mel.size > WakeRules.MEL_WINDOW) mel.removeFirst()

    embeddings.addLast(models.embed(mel.toTypedArray()))
    while (embeddings.size > WakeRules.EMBEDDINGS) embeddings.removeFirst()

    frames += 1
    if (embeddings.size < WakeRules.EMBEDDINGS || frames <= WakeRules.WARMUP_FRAMES) {
      lastScore = 0f
      return false
    }
    lastScore = models.score(embeddings.toTypedArray())
    if (lastScore < threshold || nowMs - lastFiredAt < refractoryMs) return false
    lastFiredAt = nowMs
    return true
  }
}

/** What the ongoing notification says and offers (JS hands the words over, voice plan §3 4.4). */
internal data class WakeCopy(
  val channel: String = "Listening at home",
  val title: String = "At home · listening",
  val body: String = "Model ready · location on",
  val pause: String = "Pause 1 hour",
  val resume: String = "Resume",
  val settings: String = "Settings",
  val paused: String = "Paused until {time}",
  val locked: String = "Locked. Open Aster to listen.",
  val heardTitle: String = "Hey Aster",
  val heardBody: String = "Tap to talk to Aster.",
)

/**
 * The service's rules from JS: the words, and when the unlocked session ends (its token's expiry
 * and "Lock when I leave" minutes in the background), so the service locks itself with the app
 * closed.
 */
internal data class WakeConfig(
  val copy: WakeCopy = WakeCopy(),
  val accent: String = "#FFFFFF",
  /** Epoch ms the session's token expires; 0: unknown. */
  val lockAt: Long = 0,
  /** "Lock when I leave": minutes in the background; null: never. */
  val autoLockMinutes: Int? = null,
) {
  /** The session has ended: its token expired, or the app was away longer than "Lock when I leave". */
  fun locked(nowMs: Long, backgroundSinceMs: Long?): Boolean {
    if (lockAt in 1..nowMs) return true
    val minutes = autoLockMinutes ?: return false
    return backgroundSinceMs != null && nowMs - backgroundSinceMs >= minutes * 60_000L
  }
}
