package expo.modules.astersystem

import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechTextTest {
  @Test
  fun `recognizer errors become the app's kinds`() {
    assertEquals("no-speech", SpeechText.errorKind(6))
    assertEquals("no-speech", SpeechText.errorKind(7))
    assertEquals("permission", SpeechText.errorKind(9))
    assertEquals("busy", SpeechText.errorKind(8))
    assertEquals("network", SpeechText.errorKind(2))
    assertEquals("language", SpeechText.errorKind(13))
    assertEquals("cancelled", SpeechText.errorKind(5))
    assertEquals("failed", SpeechText.errorKind(99))
  }

  @Test
  fun `a missing language pack on the device is tried again off it, once`() {
    assertEquals(true, SpeechText.retryOffDevice(13, onDevice = true))
    assertEquals(true, SpeechText.retryOffDevice(12, onDevice = true))
    assertEquals(false, SpeechText.retryOffDevice(13, onDevice = false))
    assertEquals(false, SpeechText.retryOffDevice(7, onDevice = true))
  }

  @Test
  fun `the best result is the first non-blank one, tidied`() {
    assertEquals("remind me at nine", SpeechText.best(listOf("  ", " remind  me\tat nine ", "other")))
    assertEquals("", SpeechText.best(null))
    assertEquals("", SpeechText.best(listOf("", " ")))
  }

  @Test
  fun `speech rate stays between half and double speed`() {
    assertEquals(1.0f, SpeechText.clampRate(1.0))
    assertEquals(0.5f, SpeechText.clampRate(0.1))
    assertEquals(2.0f, SpeechText.clampRate(9.0))
  }
}
