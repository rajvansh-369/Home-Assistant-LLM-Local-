package expo.modules.astersystem

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The wake word's streaming rules (docs/aster-voice-plan.md §6) with stand-in models. */
class WakeRulesTest {
  /** Records what the detector hands each model; the score is whatever the test sets. */
  private class FakeModels : WakeModels {
    val melInputs = mutableListOf<FloatArray>()
    val embedWindows = mutableListOf<Array<FloatArray>>()
    var embedCount = 0
    var nextScore = 0f
    var scored = 0

    override fun mel(samples: FloatArray): Array<FloatArray> {
      melInputs.add(samples.copyOf())
      // 8 frames whose bins carry the frame's first sample, so scaling is visible.
      return Array(8) { FloatArray(WakeRules.MEL_BINS) { samples[WakeRules.MEL_CONTEXT] } }
    }

    override fun embed(window: Array<FloatArray>): FloatArray {
      embedWindows.add(window)
      embedCount += 1
      return FloatArray(WakeRules.EMBEDDING_SIZE) { embedCount.toFloat() }
    }

    override fun score(embeddings: Array<FloatArray>): Float {
      assertEquals(WakeRules.EMBEDDINGS, embeddings.size)
      scored += 1
      return nextScore
    }
  }

  private fun frame(value: Short) = ShortArray(WakeRules.FRAME) { value }

  @Test
  fun eachFrameIsSentWithThe480SamplesBeforeIt() {
    val models = FakeModels()
    val detector = WakeDetector(models)
    detector.process(frame(7), 0)
    detector.process(frame(9), 80)

    assertEquals(WakeRules.MEL_CONTEXT + WakeRules.FRAME, models.melInputs[0].size)
    assertArrayEquals(FloatArray(WakeRules.MEL_CONTEXT), models.melInputs[0].copyOfRange(0, 480), 0f)
    assertEquals(7f, models.melInputs[0][480], 0f)
    // The second call starts with the last 480 samples of the first frame.
    assertArrayEquals(FloatArray(480) { 7f }, models.melInputs[1].copyOfRange(0, 480), 0f)
    assertEquals(9f, models.melInputs[1][480], 0f)
  }

  @Test
  fun theEmbeddingSeesTheNewest76ScaledMelFrames() {
    val models = FakeModels()
    val detector = WakeDetector(models)
    detector.process(frame(30), 0)

    val window = models.embedWindows[0]
    assertEquals(WakeRules.MEL_WINDOW, window.size)
    // 68 of openWakeWord's starting ones, then 8 new frames scaled 30 / 10 + 2.
    assertEquals(1f, window[67][0], 0f)
    assertEquals(5f, window[68][0], 0f)
    assertEquals(5f, window[75][31], 0f)
  }

  @Test
  fun noScoreUntil16EmbeddingsThenFiresAtTheThreshold() {
    val models = FakeModels()
    val detector = WakeDetector(models)
    models.nextScore = 0.9f
    for (i in 0 until 15) assertFalse(detector.process(frame(1), i * 80L))
    assertEquals(0, models.scored)
    assertTrue(detector.process(frame(1), 15 * 80L))
    assertEquals(0.9f, detector.lastScore, 0f)
  }

  @Test
  fun belowTheThresholdNeverFires() {
    val models = FakeModels()
    val detector = WakeDetector(models)
    models.nextScore = 0.49f
    repeat(40) { assertFalse(detector.process(frame(1), it * 80L)) }
  }

  @Test
  fun afterFiringItIgnoresTwoSeconds() {
    val models = FakeModels()
    val detector = WakeDetector(models)
    models.nextScore = 0.95f
    val fired = mutableListOf<Long>()
    for (i in 0 until 60) {
      val at = i * 80L
      if (detector.process(frame(1), at)) fired.add(at)
    }
    // First at 1200 ms (the 16th frame), then not before 3200 ms.
    assertEquals(listOf(1200L, 3200L), fired.take(2))
  }

  @Test
  fun resetStartsOverSoOldAudioNeverScores() {
    val models = FakeModels()
    val detector = WakeDetector(models)
    repeat(20) { detector.process(frame(1), it * 80L) }
    val before = models.scored
    detector.reset()
    repeat(15) { detector.process(frame(1), 10_000L + it * 80L) }
    assertEquals(before, models.scored)
  }

  @Test
  fun theSessionLocksAtItsExpiryOrAfterLockWhenILeave() {
    val config = WakeConfig(lockAt = 10_000, autoLockMinutes = 5)
    assertFalse(config.locked(9_999, null))
    assertTrue(config.locked(10_000, null))

    val minutes = WakeConfig(autoLockMinutes = 5)
    assertFalse(minutes.locked(1_000_000, null))
    assertFalse(minutes.locked(1_000_000, 1_000_000 - 299_999))
    assertTrue(minutes.locked(1_000_000, 1_000_000 - 300_000))

    assertFalse(WakeConfig().locked(Long.MAX_VALUE / 2, 0))
  }
}
