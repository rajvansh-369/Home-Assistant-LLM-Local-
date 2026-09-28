package expo.modules.astersystem

import android.app.Notification
import android.app.Person
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.service.notification.StatusBarNotification

/** One received message from a notification. `sender` is a person's name or a number. */
internal data class ParsedMessage(val sender: String, val text: String, val time: Long)

/** A supported app's notification, as messages of one thread. */
internal data class ParsedNotification(
  val source: String,
  val title: String,
  val isGroup: Boolean,
  val messages: List<ParsedMessage>
) {
  val threadKey: String get() = MessageText.threadKey(source, title)
}

/**
 * Notification extras to messages (docs/aster-messages-alerts-plan.md §4). WhatsApp, Google Chat
 * and SMS apps use MessagingStyle, whose `EXTRA_MESSAGES` bundles carry each message's sender, text
 * and time; anything else falls back to the title and text. Messages with no sender are the user's
 * own and are skipped.
 */
internal object MessageParser {
  private val WHATSAPP = setOf("com.whatsapp", "com.whatsapp.w4b")
  private val GOOGLE_CHAT = setOf("com.google.android.apps.dynamite")
  private val SMS = setOf(
    "com.google.android.apps.messaging",
    "com.samsung.android.messaging",
    "com.android.messaging"
  )

  /** Packages 4.2's "Open" may launch (also listed in the module manifest's <queries>). */
  val PACKAGES = WHATSAPP + GOOGLE_CHAT + SMS

  private val SKIPPED_CATEGORIES = setOf(
    Notification.CATEGORY_CALL,
    "missed_call",
    Notification.CATEGORY_SERVICE,
    Notification.CATEGORY_PROGRESS,
    Notification.CATEGORY_SYSTEM,
    Notification.CATEGORY_TRANSPORT
  )

  fun sourceOf(pkg: String, defaultSms: String?): String? = when {
    pkg in WHATSAPP -> "whatsapp"
    pkg in GOOGLE_CHAT -> "google_chat"
    pkg in SMS || pkg == defaultSms -> "sms"
    else -> null
  }

  fun parse(sbn: StatusBarNotification, defaultSms: String?): ParsedNotification? {
    val source = sourceOf(sbn.packageName, defaultSms) ?: return null
    val notification = sbn.notification ?: return null
    val flags = notification.flags
    if (flags and Notification.FLAG_GROUP_SUMMARY != 0) return null
    if (flags and (Notification.FLAG_ONGOING_EVENT or Notification.FLAG_FOREGROUND_SERVICE) != 0) {
      return null
    }
    if (notification.category in SKIPPED_CATEGORIES) return null
    val extras = notification.extras ?: return null

    val isGroup = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
    val conversation = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
    val self = selfName(extras)

    val bundles = messageBundles(extras)
    val messages = if (bundles.isNotEmpty()) {
      bundles.mapNotNull { fromBundle(it, self) }
    } else {
      val text = (
        extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
          ?: extras.getCharSequence(Notification.EXTRA_TEXT)
        )?.toString()
      val sender = title?.let(MessageText::cleanTitle)
      val time = if (notification.`when` > 0) notification.`when` else sbn.postTime
      if (sender.isNullOrBlank() || text.isNullOrBlank()) emptyList()
      else listOf(ParsedMessage(sender, text.trim(), time))
    }
    val threadTitle = MessageText.threadTitle(conversation, title, isGroup, messages) ?: return null
    if (messages.isEmpty()) return null
    return ParsedNotification(source, threadTitle, isGroup, messages)
  }

  /** The user's own name in MessagingStyle, to skip replies some apps attribute to "You". */
  @Suppress("DEPRECATION") // EXTRA_SELF_DISPLAY_NAME: Android 7–8's name for it.
  private fun selfName(extras: Bundle): String? {
    if (Build.VERSION.SDK_INT >= 28) {
      val person = if (Build.VERSION.SDK_INT >= 33) {
        extras.getParcelable(Notification.EXTRA_MESSAGING_PERSON, Person::class.java)
      } else {
        @Suppress("DEPRECATION")
        extras.getParcelable(Notification.EXTRA_MESSAGING_PERSON) as? Person
      }
      person?.name?.toString()?.let { return it }
    }
    return extras.getCharSequence(Notification.EXTRA_SELF_DISPLAY_NAME)?.toString()
  }

  private fun messageBundles(extras: Bundle): List<Bundle> {
    val raw: Array<out Parcelable>? = if (Build.VERSION.SDK_INT >= 33) {
      extras.getParcelableArray(Notification.EXTRA_MESSAGES, Parcelable::class.java)
    } else {
      @Suppress("DEPRECATION")
      extras.getParcelableArray(Notification.EXTRA_MESSAGES)
    }
    return raw?.filterIsInstance<Bundle>().orEmpty()
  }

  private fun fromBundle(bundle: Bundle, self: String?): ParsedMessage? {
    val text = bundle.getCharSequence("text")?.toString()?.trim()
    if (text.isNullOrEmpty()) return null
    val person = if (Build.VERSION.SDK_INT >= 33) {
      bundle.getParcelable("sender_person", Person::class.java)
    } else if (Build.VERSION.SDK_INT >= 28) {
      @Suppress("DEPRECATION")
      bundle.getParcelable("sender_person") as? Person
    } else {
      null
    }
    val sender = person?.name?.toString() ?: bundle.getCharSequence("sender")?.toString()
    if (sender.isNullOrBlank()) return null
    if (self != null && MessageText.normalize(sender) == MessageText.normalize(self)) return null
    return ParsedMessage(sender.trim(), text, bundle.getLong("time", 0L))
  }
}
