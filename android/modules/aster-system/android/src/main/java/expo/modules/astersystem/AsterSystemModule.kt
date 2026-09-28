package expo.modules.astersystem

import android.app.ActivityOptions
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Special access that has no runtime prompt (plan §7): notification access and battery. And the
 * captured messages and spoken alerts (docs/aster-messages-alerts-plan.md §2 Native): threads,
 * Send, the rules and the activity events JS collects.
 */
class AsterSystemModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val listenerComponent: ComponentName
    get() = ComponentName(context, AsterNotificationListener::class.java)

  override fun definition() = ModuleDefinition {
    Name("AsterSystem")

    Events("onMessagesChanged", "onActivity")

    OnCreate {
      AsterEvents.sink = { name -> sendEvent(name, Bundle.EMPTY) }
    }

    OnDestroy {
      AsterEvents.sink = null
    }

    // Captured messages --------------------------------------------------------------------------

    AsyncFunction("listThreads") {
      MessageStore.get(context).threads().map { thread ->
        mapOf(
          "key" to thread.key,
          "source" to thread.source,
          "title" to thread.title,
          "isGroup" to thread.isGroup,
          "count" to thread.count,
          "unreadSenders" to thread.unreadSenders,
          "spokenAt" to thread.spokenAt?.toDouble(),
          "canReply" to AsterNotificationListener.canReply(thread.key),
          "last" to messageMap(thread.last)
        )
      }
    }

    AsyncFunction("threadMessages") { key: String, limit: Int ->
      MessageStore.get(context).messages(key, limit.coerceIn(1, 500)).map(::messageMap)
    }

    AsyncFunction("markThreadSeen") { key: String ->
      AlertEngine.onThreadRead(context, key)
      AsterEvents.messagesChanged()
    }

    // Fills the thread's Reply action and fires it. "no-action" when its notification is gone.
    AsyncFunction("sendReply") { key: String, text: String ->
      val action = AsterNotificationListener.replyActions[key]
        ?.takeIf { AsterNotificationListener.canReply(key) }
        ?: return@AsyncFunction "no-action"
      val inputs = action.remoteInputs ?: return@AsyncFunction "no-action"
      val intent = Intent()
      val results = Bundle().apply { inputs.forEach { putCharSequence(it.resultKey, text) } }
      RemoteInput.addResultsToIntent(inputs, intent, results)
      if (Build.VERSION.SDK_INT >= 28) {
        RemoteInput.setResultsSource(intent, RemoteInput.SOURCE_FREE_FORM_INPUT)
      }
      try {
        action.actionIntent.send(context, 0, intent)
      } catch (e: PendingIntent.CanceledException) {
        AsterNotificationListener.replyActions.remove(key)
        return@AsyncFunction "no-action"
      }
      val store = MessageStore.get(context)
      store.thread(key)?.let { store.insertOutgoing(it, text, System.currentTimeMillis()) }
      AlertEngine.onThreadRead(context, key)
      AsterEvents.messagesChanged()
      "sent"
    }

    // The source notification's own tap (opens the chat), else the app itself.
    Function("openSourceApp") { key: String, source: String ->
      val first = AlertNotifier.openIntent(context, key, source) ?: return@Function false
      if (launch(first)) return@Function true
      AsterNotificationListener.openIntents.remove(key)
      AlertNotifier.openIntent(context, key, source)?.let(::launch) ?: false
    }

    AsyncFunction("clearMessages") {
      AlertEngine.clear(context)
      AsterEvents.messagesChanged()
    }

    // Spoken alerts ------------------------------------------------------------------------------

    Function("setAlertConfig") { json: String? ->
      AlertEngine.setConfig(context, json)
    }

    Function("setAtHome") { atHome: Boolean ->
      AlertEngine.setAtHome(context, atHome)
    }

    // The Owner's zypherLL access for Summary mode, in memory only; null when locked.
    Function("setLlmAccess") { url: String?, token: String?, expiresAt: Double? ->
      AlertEngine.llmAccess = if (url != null && token != null && expiresAt != null) {
        AlertEngine.LlmAccess(url, token, expiresAt.toLong())
      } else {
        null
      }
    }

    AsyncFunction("speak") { text: String, promise: Promise ->
      Speaker.speak(context, text) { spoken -> promise.resolve(spoken) }
    }

    Function("stopSpeaking") {
      Speaker.stop()
    }

    Function("takeActivity") {
      AlertEngine.takeActivity(context)
    }

    // Special access -----------------------------------------------------------------------------

    // Same check as NotificationManagerCompat.getEnabledListenerPackages, without androidx.core.
    Function("isNotificationListenerEnabled") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
      enabled.orEmpty().split(':').mapNotNull { ComponentName.unflattenFromString(it) }
        .any { it.packageName == context.packageName }
    }

    // Aster's own page on Android 11+, the full list before that (or if the page is missing).
    Function("openNotificationListenerSettings") {
      val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val detail = Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listenerComponent.flattenToString())
        start(detail) || start(list)
      } else {
        start(list)
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    // The system dialog; falls back to the battery optimisation list if a vendor removed it.
    Function("requestIgnoreBatteryOptimizations") {
      start(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
      ) || start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
  }

  private fun messageMap(message: StoredMessage) = mapOf(
    "id" to message.id.toDouble(),
    "threadKey" to message.threadKey,
    "source" to message.source,
    "sender" to message.sender,
    "text" to message.text,
    "at" to message.at.toDouble(),
    "outgoing" to message.outgoing,
    "otp" to message.otp,
    "read" to message.read,
    "spokenAt" to message.spokenAt?.toDouble()
  )

  /**
   * Sends another app's activity PendingIntent from the foreground. Android 14+ lets it start an
   * activity only when the sender says so.
   */
  @Suppress("DEPRECATION") // MODE_BACKGROUND_ACTIVITY_START_ALLOWED: API 34–35's name for it.
  private fun launch(intent: PendingIntent): Boolean = try {
    if (Build.VERSION.SDK_INT >= 34) {
      val options = ActivityOptions.makeBasic()
        .setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
      intent.send(context, 0, null, null, null, null, options.toBundle())
    } else {
      intent.send()
    }
    true
  } catch (e: PendingIntent.CanceledException) {
    false
  }

  /** Opens a system screen over the current activity. False when no app handles the intent. */
  private fun start(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (e: ActivityNotFoundException) {
      false
    }
  }
}
