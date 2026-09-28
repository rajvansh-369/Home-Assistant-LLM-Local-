package expo.modules.astersystem

import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale

/**
 * Pure text rules for captured messages (docs/aster-messages-alerts-plan.md §4, §5), kept free of
 * Android classes so JUnit can check them. `normalize` must match `normalizeName` in
 * src/features/messages/vip.ts.
 */
internal object MessageText {
  private val SPACES = Regex("\\s+")
  private val COUNT_SUFFIX = Regex("\\s*\\(\\d+\\s+(new\\s+)?messages?\\)\\s*$", RegexOption.IGNORE_CASE)
  private val CODE_WORD = Regex(
    "\\b(otp|one[- ]?time|verification|verify|passcode|pin|code)\\b",
    RegexOption.IGNORE_CASE
  )
  private val CODE_DIGITS = Regex("(?<!\\d)\\d{4,8}(?!\\d)")

  /** Unicode NFKC, lower case, spaces collapsed, trimmed. */
  fun normalize(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFKC)
      .lowercase(Locale.ROOT)
      .replace(SPACES, " ")
      .trim()

  /** "Asha (2 messages)" → "Asha". */
  fun cleanTitle(value: String): String = value.replace(COUNT_SUFFIX, "").trim()

  /**
   * The thread's name: a group's conversation title, else the sender of a one-to-one chat (all its
   * messages share one), else the notification title.
   */
  fun threadTitle(
    conversation: String?,
    title: String?,
    isGroup: Boolean,
    messages: List<ParsedMessage>
  ): String? {
    val candidates = if (isGroup) {
      listOf(conversation, title)
    } else {
      listOf(messages.firstOrNull()?.sender, conversation, title)
    }
    return candidates.firstNotNullOfOrNull { it?.let(::cleanTitle)?.takeIf(String::isNotBlank) }
  }

  /** `{source}-{first 20 hex of SHA-256(normalised title)}`: the key names no one. */
  fun threadKey(source: String, title: String): String =
    "$source-${sha256(normalize(title)).take(20)}"

  /** Apps re-post the whole conversation with each message; this spots the ones already kept. */
  fun digest(threadKey: String, sender: String, time: Long, text: String): String =
    sha256("$threadKey\u0000$sender\u0000$time\u0000$text")

  /** A one-time code: a code word and 4–8 digits. Never spoken, never sent to zypherLL. */
  fun isOneTimeCode(text: String): Boolean =
    CODE_WORD.containsMatchIn(text) && CODE_DIGITS.containsMatchIn(text)

  private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256")
      .digest(value.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
}
