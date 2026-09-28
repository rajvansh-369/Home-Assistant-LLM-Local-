package expo.modules.astersystem

/**
 * Spoken-alert rules (docs/aster-messages-alerts-plan.md §5), free of Android classes so JUnit can
 * check them. The alert engine gathers the facts; these decide.
 */

internal data class VipRule(val id: Long, val name: String, val matchKey: String, val sources: Set<String>)

/** Text the engine speaks and shows, from src/features/messages/copy.ts (English defaults here). */
internal data class AlertCopy(
  val full: String = "{name} sent {count} {source} {messages}. {texts}",
  val name: String = "You missed {count} {source} {messages} from {name}.",
  val summary: String = "{name} sent {count} {source} {messages}. {summary}",
  val title: String = "{name} · {count} missed {source} {messages}",
  val activity: String = "Read out {count} {source} {messages} from {name}",
  val message: String = "message",
  val messages: String = "messages",
  val sources: Map<String, String> = mapOf(
    "whatsapp" to "WhatsApp",
    "google_chat" to "Google Chat",
    "sms" to "SMS"
  ),
  val reply: String = "Reply",
  val remind: String = "Remind in 30 min",
  val open: String = "Open",
  val channel: String = "Missed messages",
  val summaryPrompt: String =
    "Summarise these messages in one short sentence for someone who missed them. Say only the summary."
)

internal data class AlertConfig(
  val enabled: Boolean = true,
  val missedAfterMinutes: Int = 10,
  val speakMode: String = "full",
  /** Minutes after midnight, or null when quiet hours are off. */
  val quietStart: Int? = null,
  val quietEnd: Int? = null,
  val urgentKeywords: List<String> = emptyList(),
  val headphonesOnly: Boolean = false,
  val onlyAtHome: Boolean = false,
  val hideOnLockScreen: Boolean = true,
  val vips: List<VipRule> = emptyList(),
  /** The notification colour, from src/theme. */
  val accent: String = "#6EECC1",
  val copy: AlertCopy = AlertCopy()
)

/** What the engine knows at the moment of deciding. */
internal data class AlertFacts(
  val minuteOfDay: Int,
  val atHome: Boolean,
  val headset: Boolean,
  val inCall: Boolean
)

internal sealed class Decision {
  object Speak : Decision()
  data class Hold(val reason: String) : Decision()
}

internal object AlertRules {
  /** A message older than this when captured (after a restart, say) is kept but never alerted. */
  const val STALE_MS = 30L * 60 * 1000
  const val MAX_SPOKEN = 5
  const val MAX_TEXT = 300

  /** "HH:MM" to minutes after midnight. */
  fun minutes(hhmm: String?): Int? {
    val match = Regex("^(\\d{1,2}):(\\d{2})").find(hhmm ?: return null) ?: return null
    val (h, m) = match.destructured
    val hours = h.toInt()
    val mins = m.toInt()
    return if (hours in 0..23 && mins in 0..59) hours * 60 + mins else null
  }

  /** The VIP a message is from: its sender (or a one-to-one thread's title) and its app. */
  fun vipFor(vips: List<VipRule>, source: String, sender: String, title: String, isGroup: Boolean): VipRule? {
    val names = if (isGroup) listOf(sender) else listOf(sender, title)
    val normalised = names.map(MessageText::normalize).toSet()
    return vips.firstOrNull { vip ->
      source in vip.sources && MessageText.normalize(vip.matchKey) in normalised
    }
  }

  /** Overnight ranges wrap: 23:00–07:00 holds 23:30 and 06:59, not 07:00. */
  fun inQuietHours(minuteOfDay: Int, start: Int?, end: Int?): Boolean {
    if (start == null || end == null || start == end) return false
    return if (start < end) minuteOfDay in start until end else minuteOfDay >= start || minuteOfDay < end
  }

  fun isUrgent(texts: List<String>, keywords: List<String>): Boolean {
    val words = keywords.map(MessageText::normalize).filter(String::isNotEmpty)
    if (words.isEmpty()) return false
    return texts.map(MessageText::normalize).any { text -> words.any { text.contains(it) } }
  }

  fun decide(config: AlertConfig, facts: AlertFacts, texts: List<String>): Decision {
    if (facts.inCall) return Decision.Hold("call")
    if (inQuietHours(facts.minuteOfDay, config.quietStart, config.quietEnd) &&
      !isUrgent(texts, config.urgentKeywords)
    ) {
      return Decision.Hold("quiet")
    }
    if (config.onlyAtHome && !facts.atHome) return Decision.Hold("away")
    if (config.headphonesOnly && !facts.headset) return Decision.Hold("speaker")
    return Decision.Speak
  }

  private fun fill(template: String, values: Map<String, String>): String =
    values.entries.fold(template) { text, (key, value) -> text.replace("{$key}", value) }
      .replace(Regex("\\s+"), " ")
      .trim()

  /** Ends each text as a sentence, so the voice pauses between messages. */
  private fun sentence(text: String): String {
    val trimmed = text.trim().replace(Regex("\\s+"), " ").take(MAX_TEXT).trim()
    return if (trimmed.isEmpty() || trimmed.last() in ".!?…") trimmed else "$trimmed."
  }

  private fun values(copy: AlertCopy, name: String, source: String, count: Int) = mapOf(
    "name" to name,
    "count" to count.toString(),
    "source" to (copy.sources[source] ?: source),
    "messages" to if (count == 1) copy.message else copy.messages
  )

  /** What Aster says. `summary` is null when zypherLL gave none: Summary falls back to Full. */
  fun phrase(config: AlertConfig, name: String, source: String, texts: List<String>, summary: String?): String {
    val copy = config.copy
    val base = values(copy, name, source, texts.size)
    return when {
      config.speakMode == "name" -> fill(copy.name, base)
      config.speakMode == "summary" && !summary.isNullOrBlank() ->
        fill(copy.summary, base + ("summary" to sentence(summary)))
      else -> fill(copy.full, base + ("texts" to texts.takeLast(MAX_SPOKEN).joinToString(" ") { sentence(it) }))
    }
  }

  fun title(config: AlertConfig, name: String, source: String, count: Int): String =
    fill(config.copy.title, values(config.copy, name, source, count))

  fun activitySummary(config: AlertConfig, name: String, source: String, count: Int): String =
    fill(config.copy.activity, values(config.copy, name, source, count)).take(200)
}
