package expo.modules.astersystem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** docs/aster-messages-alerts-plan.md §4 and §5: the pure rules behind capture and alerts. */
class AlertRulesTest {
  private val asha = VipRule(1, "Asha", "Asha Kulkarni", setOf("whatsapp", "sms"))
  private val at = AlertFacts(minuteOfDay = 12 * 60, atHome = true, headset = false, inCall = false)

  @Test
  fun vipMatchesSenderOrOneToOneTitleOnItsApps() {
    val vips = listOf(asha)
    assertEquals(asha, AlertRules.vipFor(vips, "whatsapp", "  asha   KULKARNI ", "x", isGroup = false))
    assertEquals(asha, AlertRules.vipFor(vips, "sms", "+91 98xxxx", "Asha Kulkarni", isGroup = false))
    // In a group the title is the group's name, never a person.
    assertNull(AlertRules.vipFor(vips, "whatsapp", "Ravi", "Asha Kulkarni", isGroup = true))
    assertEquals(asha, AlertRules.vipFor(vips, "whatsapp", "Asha Kulkarni", "Family", isGroup = true))
    assertNull(AlertRules.vipFor(vips, "google_chat", "Asha Kulkarni", "Asha Kulkarni", isGroup = false))
  }

  @Test
  fun quietHoursWrapPastMidnight() {
    val start = AlertRules.minutes("23:00")
    val end = AlertRules.minutes("07:00")
    assertTrue(AlertRules.inQuietHours(23 * 60 + 30, start, end))
    assertTrue(AlertRules.inQuietHours(6 * 60 + 59, start, end))
    assertFalse(AlertRules.inQuietHours(7 * 60, start, end))
    assertTrue(AlertRules.inQuietHours(14 * 60, AlertRules.minutes("13:00"), AlertRules.minutes("15:00")))
    assertFalse(AlertRules.inQuietHours(14 * 60, null, end))
    assertNull(AlertRules.minutes("25:00"))
  }

  @Test
  fun decideHoldsForQuietHoursUnlessUrgentThenAwayAndSpeaker() {
    val quiet = AlertConfig(quietStart = 11 * 60, quietEnd = 13 * 60, urgentKeywords = listOf("urgent", "call me"))
    assertEquals(Decision.Hold("quiet"), AlertRules.decide(quiet, at, listOf("Lunch?")))
    assertEquals(Decision.Speak, AlertRules.decide(quiet, at, listOf("Please CALL ME back")))
    assertEquals(Decision.Hold("away"), AlertRules.decide(AlertConfig(onlyAtHome = true), at.copy(atHome = false), listOf("Hi")))
    assertEquals(Decision.Hold("speaker"), AlertRules.decide(AlertConfig(headphonesOnly = true), at, listOf("Hi")))
    assertEquals(Decision.Speak, AlertRules.decide(AlertConfig(headphonesOnly = true), at.copy(headset = true), listOf("Hi")))
    assertEquals(Decision.Hold("call"), AlertRules.decide(AlertConfig(), at.copy(inCall = true), listOf("Hi")))
  }

  @Test
  fun phraseFollowsTheSpeakMode() {
    val texts = listOf("Call me when you're free", "Are you coming on Sunday?")
    assertEquals(
      "Asha sent 2 WhatsApp messages. Call me when you're free. Are you coming on Sunday?",
      AlertRules.phrase(AlertConfig(), "Asha", "whatsapp", texts, null)
    )
    assertEquals(
      "You missed 1 SMS message from Asha.",
      AlertRules.phrase(AlertConfig(speakMode = "name"), "Asha", "sms", texts.take(1), null)
    )
    assertEquals(
      "Asha sent 2 WhatsApp messages. She wants a call back.",
      AlertRules.phrase(AlertConfig(speakMode = "summary"), "Asha", "whatsapp", texts, "She wants a call back")
    )
    // No summary: the full message instead.
    assertTrue(AlertRules.phrase(AlertConfig(speakMode = "summary"), "Asha", "whatsapp", texts, null).endsWith("Sunday?"))
    assertEquals("Asha · 2 missed WhatsApp messages", AlertRules.title(AlertConfig(), "Asha", "whatsapp", 2))
  }

  @Test
  fun messageTextRules() {
    assertEquals("Asha", MessageText.cleanTitle("Asha (2 messages)"))
    assertEquals("Asha", MessageText.cleanTitle("Asha (3 new messages) "))
    assertEquals(
      MessageText.threadKey("whatsapp", "Asha  Kulkarni"),
      MessageText.threadKey("whatsapp", "asha kulkarni")
    )
    assertTrue(MessageText.threadKey("sms", "Asha").matches(Regex("sms-[0-9a-f]{20}")))
    assertTrue(MessageText.isOneTimeCode("Your OTP is 482913. Do not share it."))
    assertTrue(MessageText.isOneTimeCode("123456 is your verification code"))
    assertFalse(MessageText.isOneTimeCode("Can you review the code before 10?"))
    assertFalse(MessageText.isOneTimeCode("Meet at 1030"))
  }

  @Test
  fun threadTitleUsesTheSenderForOneToOneAndTheConversationForGroups() {
    val messages = listOf(ParsedMessage("Asha", "Hi", 1))
    assertEquals("Asha", MessageText.threadTitle(null, "Asha (2 messages)", false, messages))
    assertEquals("Family", MessageText.threadTitle("Family", "Family: Asha", true, messages))
    assertNull(MessageText.threadTitle(null, null, true, messages))
  }
}
