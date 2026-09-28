package expo.modules.astersystem

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * VIP spoken alerts with the app closed (docs/aster-messages-alerts-plan.md §5). A VIP's unread
 * message arms the thread's timer; at the timer the rules decide to speak or hold, and the missed
 * notification is posted either way. JS hands over the rules (`setConfig`), whether the phone is at
 * home, and the Owner's llm_token while unlocked (memory only), and collects the activity events.
 */
internal object AlertEngine {
  private const val PREFS = "aster.alerts"
  private const val CONFIG = "config"
  private const val AT_HOME = "at-home"
  private const val ACTIVITY = "activity"
  private const val MAX_ACTIVITY = 200

  const val MISSED = "missed"
  const val REMIND = "remind"
  const val REMIND_MS = 30L * 60 * 1000
  const val ACTION_TIMER = "expo.modules.astersystem.ALERT_TIMER"
  const val ACTION_REMIND = "expo.modules.astersystem.ALERT_REMIND"
  const val EXTRA_THREAD = "thread"
  const val EXTRA_KIND = "kind"

  /** The Owner's zypherLL access for Summary mode, while the Owner is unlocked. Never stored. */
  data class LlmAccess(val url: String, val token: String, val expiresAt: Long)

  @Volatile var llmAccess: LlmAccess? = null

  @Volatile private var cached: AlertConfig? = null
  private val activityLock = Any()

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // Config ------------------------------------------------------------------------------------

  fun setConfig(context: Context, json: String?) {
    prefs(context).edit().apply { if (json == null) remove(CONFIG) else putString(CONFIG, json) }.apply()
    cached = null
  }

  fun config(context: Context): AlertConfig =
    cached ?: parseConfig(prefs(context).getString(CONFIG, null)).also { cached = it }

  fun setAtHome(context: Context, atHome: Boolean) {
    prefs(context).edit().putBoolean(AT_HOME, atHome).apply()
  }

  fun atHome(context: Context): Boolean = prefs(context).getBoolean(AT_HOME, false)

  private fun parseConfig(json: String?): AlertConfig {
    val root = try {
      json?.let(::JSONObject)
    } catch (e: Exception) {
      null
    } ?: return AlertConfig()
    val defaults = AlertConfig()
    val settings = root.optJSONObject("settings") ?: JSONObject()
    val vips = root.optJSONArray("vips") ?: JSONArray()
    val words = settings.optJSONArray("urgent_keywords") ?: JSONArray()
    return AlertConfig(
      enabled = settings.optBoolean("enabled", defaults.enabled),
      missedAfterMinutes = settings.optInt("missed_after_minutes", defaults.missedAfterMinutes).coerceIn(1, 120),
      speakMode = settings.optString("speak_mode", defaults.speakMode),
      quietStart = AlertRules.minutes(settings.optString("quiet_start", "")),
      quietEnd = AlertRules.minutes(settings.optString("quiet_end", "")),
      urgentKeywords = (0 until words.length()).map { words.optString(it) },
      headphonesOnly = settings.optBoolean("headphones_only", defaults.headphonesOnly),
      onlyAtHome = settings.optBoolean("only_at_home", defaults.onlyAtHome),
      hideOnLockScreen = root.optBoolean("hide_on_lock_screen", defaults.hideOnLockScreen),
      vips = (0 until vips.length()).mapNotNull { i ->
        val vip = vips.optJSONObject(i) ?: return@mapNotNull null
        if (!vip.optBoolean("enabled", true)) return@mapNotNull null
        val sources = vip.optJSONArray("sources") ?: JSONArray()
        VipRule(
          id = vip.optLong("id"),
          name = vip.optString("name"),
          matchKey = vip.optString("match_key"),
          sources = (0 until sources.length()).map { sources.optString(it) }.toSet()
        )
      },
      accent = root.optString("accent", defaults.accent),
      copy = parseCopy(root.optJSONObject("copy"), defaults.copy)
    )
  }

  private fun parseCopy(json: JSONObject?, defaults: AlertCopy): AlertCopy {
    if (json == null) return defaults
    fun text(key: String, fallback: String) = json.optString(key, fallback).ifBlank { fallback }
    val sources = json.optJSONObject("sources")
    return AlertCopy(
      full = text("full", defaults.full),
      name = text("name", defaults.name),
      summary = text("summary", defaults.summary),
      title = text("title", defaults.title),
      activity = text("activity", defaults.activity),
      message = text("message", defaults.message),
      messages = text("messages", defaults.messages),
      sources = defaults.sources.mapValues { (key, value) -> sources?.optString(key, value)?.ifBlank { value } ?: value },
      reply = text("reply", defaults.reply),
      remind = text("remind", defaults.remind),
      open = text("open", defaults.open),
      channel = text("channel", defaults.channel),
      summaryPrompt = text("summaryPrompt", defaults.summaryPrompt)
    )
  }

  // Capture and reading -----------------------------------------------------------------------

  /** New messages arrived: a VIP's recent, unread message arms the thread's missed timer. */
  fun onCaptured(context: Context, parsed: ParsedNotification, added: List<StoredMessage>) {
    val config = config(context)
    if (!config.enabled) return
    val now = System.currentTimeMillis()
    val fresh = added.filter { message ->
      !message.otp && now - message.at < AlertRules.STALE_MS &&
        AlertRules.vipFor(config.vips, message.source, message.sender, message.title, message.isGroup) != null
    }
    if (fresh.isEmpty()) return
    val store = MessageStore.get(context)
    val due = maxOf(fresh.minOf { it.at } + config.missedAfterMinutes * 60_000L, now + 1_000)
    store.putTimer(parsed.threadKey, MISSED, due, replace = false)
    store.timers().firstOrNull { it.threadKey == parsed.threadKey && it.kind == MISSED }
      ?.let { schedule(context, it) }
  }

  /** The thread was opened or dismissed (or 4.2 opened it): stay quiet about it. */
  fun onThreadRead(context: Context, threadKey: String) {
    val store = MessageStore.get(context)
    store.markRead(threadKey)
    for (kind in listOf(MISSED, REMIND)) {
      store.deleteTimer(threadKey, kind)
      alarms(context).cancel(timerIntent(context, threadKey, kind))
    }
    AlertNotifier.cancel(context, threadKey)
  }

  /** "Remind in 30 min" on the missed notification. */
  fun remindLater(context: Context, threadKey: String) {
    AlertNotifier.cancel(context, threadKey)
    val timer = AlertTimer(threadKey, REMIND, System.currentTimeMillis() + REMIND_MS)
    MessageStore.get(context).putTimer(threadKey, REMIND, timer.dueAt, replace = true)
    schedule(context, timer)
  }

  /** Listener connected (after a boot or an update): arm every stored timer again. */
  fun rearm(context: Context) {
    val now = System.currentTimeMillis()
    for (timer in MessageStore.get(context).timers()) {
      if (timer.dueAt <= now) onTimer(context, timer.threadKey, timer.kind) else schedule(context, timer)
    }
  }

  // Timers ------------------------------------------------------------------------------------

  private fun alarms(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun timerIntent(context: Context, threadKey: String, kind: String): PendingIntent {
    val intent = Intent(context, AlertReceiver::class.java)
      .setAction(ACTION_TIMER)
      .setData(Uri.parse("aster-alert://$kind/$threadKey"))
      .putExtra(EXTRA_THREAD, threadKey)
      .putExtra(EXTRA_KIND, kind)
    return PendingIntent.getBroadcast(
      context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun schedule(context: Context, timer: AlertTimer) {
    val manager = alarms(context)
    val intent = timerIntent(context, timer.threadKey, timer.kind)
    // Exact when allowed ("Alarms & reminders"); otherwise Android may run it a few minutes late.
    if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timer.dueAt, intent)
    } else {
      manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timer.dueAt, intent)
    }
  }

  /** A timer rang: are the thread's VIP messages still unread? Then speak or hold. */
  fun onTimer(context: Context, threadKey: String, kind: String) {
    val store = MessageStore.get(context)
    store.deleteTimer(threadKey, kind)
    val config = config(context)
    if (!config.enabled) return
    // With the listener connected, a thread with nothing left in the tray was opened or dismissed.
    if (AsterNotificationListener.instance != null && AsterNotificationListener.active[threadKey].isNullOrEmpty()) {
      onThreadRead(context, threadKey)
      AsterEvents.messagesChanged()
      return
    }
    val vipMessages = store.unreadForAlert(threadKey, again = kind == REMIND).filter { message ->
      AlertRules.vipFor(config.vips, message.source, message.sender, message.title, message.isGroup) != null
    }
    val last = vipMessages.lastOrNull() ?: return
    val vip = AlertRules.vipFor(config.vips, last.source, last.sender, last.title, last.isGroup) ?: return
    val texts = vipMessages.map { it.text }
    val now = System.currentTimeMillis()
    val calendar = Calendar.getInstance().apply { timeInMillis = now }
    val facts = AlertFacts(
      minuteOfDay = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE),
      atHome = atHome(context),
      headset = Speaker.headsetConnected(context),
      inCall = Speaker.inCall(context)
    )
    val speak = AlertRules.decide(config, facts, texts) == Decision.Speak
    if (speak) {
      val summary = if (config.speakMode == "summary" && facts.atHome) summarise(config, vip.name, texts) else null
      Speaker.speak(context, AlertRules.phrase(config, vip.name, last.source, texts, summary))
      val mode = when {
        config.speakMode == "name" -> "name"
        summary != null -> "summary"
        else -> "full"
      }
      queueActivity(
        context,
        type = "spoken_alert",
        summary = AlertRules.activitySummary(config, vip.name, last.source, texts.size),
        meta = JSONObject().put("source", last.source).put("count", texts.size).put("mode", mode)
      )
    }
    store.markAlerted(vipMessages.map { it.id }, now, spoken = speak)
    AlertNotifier.post(context, config, threadKey, vip.name, last.source, texts)
    AsterEvents.messagesChanged()
  }

  // Summary mode ------------------------------------------------------------------------------

  /** One sentence from the home PC's local model, or null (away, no session, slow, refused). */
  private fun summarise(config: AlertConfig, name: String, texts: List<String>): String? {
    val access = llmAccess?.takeIf { it.expiresAt > System.currentTimeMillis() } ?: return null
    return try {
      val body = JSONObject()
        .put("stream", false)
        .put("engine", "local")
        .put("web", false)
        .put("memory", false)
        .put("sampling", "precise")
        .put("max_tokens", 80)
        .put(
          "messages",
          JSONArray()
            .put(JSONObject().put("role", "system").put("content", config.copy.summaryPrompt))
            .put(JSONObject().put("role", "user").put("content", texts.joinToString("\n") { "$name: $it" }))
        )
      val connection = URL("${access.url.trimEnd('/')}/v1/chat/completions").openConnection() as HttpURLConnection
      connection.connectTimeout = 3_000
      connection.readTimeout = 8_000
      connection.requestMethod = "POST"
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("Authorization", "Bearer ${access.token}")
      connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      if (connection.responseCode !in 200..299) return null
      val reply = connection.inputStream.bufferedReader().use { it.readText() }
      JSONObject(reply).optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
        ?.optString("content")?.trim()?.takeIf { it.isNotEmpty() }
    } catch (e: Exception) {
      null
    }
  }

  // Activity events ---------------------------------------------------------------------------

  private fun isoNow(): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
      .apply { timeZone = TimeZone.getTimeZone("UTC") }
      .format(Date())

  /** Queued for JS, which sends them with the device queue. Never message text. */
  fun queueActivity(context: Context, type: String, summary: String, meta: JSONObject) {
    synchronized(activityLock) {
      val prefs = prefs(context)
      val list = try {
        JSONArray(prefs.getString(ACTIVITY, "[]"))
      } catch (e: Exception) {
        JSONArray()
      }
      list.put(
        JSONObject()
          .put("client_uuid", UUID.randomUUID().toString())
          .put("type", type)
          .put("summary", summary)
          .put("meta", meta)
          .put("occurred_at", isoNow())
      )
      val kept = JSONArray()
      for (i in maxOf(0, list.length() - MAX_ACTIVITY) until list.length()) kept.put(list.get(i))
      prefs.edit().putString(ACTIVITY, kept.toString()).apply()
    }
    AsterEvents.activity()
  }

  /** The queued events as a JSON array, and the queue emptied. */
  fun takeActivity(context: Context): String = synchronized(activityLock) {
    val prefs = prefs(context)
    val events = prefs.getString(ACTIVITY, "[]") ?: "[]"
    prefs.edit().remove(ACTIVITY).apply()
    events
  }

  /** Sign-out and reset. */
  fun clear(context: Context) {
    val store = MessageStore.get(context)
    for (timer in store.timers()) alarms(context).cancel(timerIntent(context, timer.threadKey, timer.kind))
    store.clear()
    AlertNotifier.cancelAll(context)
    llmAccess = null
    prefs(context).edit().clear().apply()
    cached = null
  }
}
