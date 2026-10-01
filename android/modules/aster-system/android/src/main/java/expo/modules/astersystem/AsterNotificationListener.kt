package expo.modules.astersystem

import android.app.Notification
import android.app.PendingIntent
import android.os.Build
import android.os.Bundle
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** The single thread that touches the message store for the listener and the alert engine. */
internal object Worker {
  private val executor = Executors.newSingleThreadExecutor { Thread(it, "aster-messages") }

  fun run(block: () -> Unit) {
    executor.execute {
      try {
        block()
      } catch (e: Exception) {
        // Never crash the listener's process over one notification. Only the exception's class is
        // logged: its message could carry message text.
        Log.w("AsterMessages", "Skipped: ${e.javaClass.simpleName}")
      }
    }
  }
}

/** Tells JS (when it runs) that something changed. The module sets the sink. */
internal object AsterEvents {
  /** Set while the JS module is alive: sends an event with its payload. */
  @Volatile var sink: ((String, Bundle) -> Unit)? = null

  fun messagesChanged() = emit("onMessagesChanged", Bundle.EMPTY)
  fun activity() = emit("onActivity", Bundle.EMPTY)
  fun emit(name: String, payload: Bundle) = sink?.invoke(name, payload)
}

/**
 * Message capture (docs/aster-messages-alerts-plan.md §4): WhatsApp, Google Chat and SMS
 * notifications become rows in the message store, and a VIP's starts the missed timer. Removing a
 * thread's notification (opened or dismissed) marks it read. The newest Reply action and tap intent
 * of each thread stay in memory for 4.2's Send and the missed notification's Open.
 */
class AsterNotificationListener : NotificationListenerService() {
  internal companion object {
    @Volatile var instance: AsterNotificationListener? = null

    /** Thread key to the keys of its notifications in the tray. */
    val active = ConcurrentHashMap<String, MutableSet<String>>()
    val replyActions = ConcurrentHashMap<String, Notification.Action>()
    val openIntents = ConcurrentHashMap<String, PendingIntent>()

    /** Thread key to the app that posted it, for "Open" when its tap intent is gone. */
    val packages = ConcurrentHashMap<String, String>()

    /** Tray notification key to its thread, for removals. */
    val threadOf = ConcurrentHashMap<String, String>()

    private var sincePurge = 0

    /** A removal that means the user saw it: opened, dismissed, or cleared by the app itself. */
    fun meansRead(reason: Int): Boolean = reason in setOf(
      REASON_CLICK,
      REASON_CANCEL,
      REASON_APP_CANCEL,
      REASON_APP_CANCEL_ALL,
      REASON_GROUP_SUMMARY_CANCELED
    )

    fun canReply(threadKey: String): Boolean =
      !active[threadKey].isNullOrEmpty() && replyActions.containsKey(threadKey)
  }

  private val defaultSms: String?
    get() = try {
      Telephony.Sms.getDefaultSmsPackage(this)
    } catch (e: Exception) {
      null
    }

  override fun onListenerConnected() {
    instance = this
    val tray = try {
      activeNotifications?.toList().orEmpty()
    } catch (e: Exception) {
      emptyList()
    }
    Worker.run {
      active.clear()
      threadOf.clear()
      tray.forEach { capture(it) }
      AlertEngine.rearm(this)
      AsterEvents.messagesChanged()
    }
  }

  override fun onListenerDisconnected() {
    if (instance === this) instance = null
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.packageName == packageName) return
    Worker.run {
      if (capture(sbn)) AsterEvents.messagesChanged()
    }
  }

  override fun onNotificationRemoved(
    sbn: StatusBarNotification?,
    rankingMap: RankingMap?,
    reason: Int
  ) {
    if (sbn == null) return
    Worker.run { removed(sbn.key, meansRead(reason)) }
  }

  @Deprecated("Before Android 8 there is no reason; treat it as read.")
  override fun onNotificationRemoved(sbn: StatusBarNotification?) {
    if (sbn == null || Build.VERSION.SDK_INT >= 26) return
    Worker.run { removed(sbn.key, true) }
  }

  /** Stores the notification's new messages. Returns true when any were new. */
  private fun capture(sbn: StatusBarNotification): Boolean {
    val parsed = MessageParser.parse(sbn, defaultSms) ?: return false
    val key = parsed.threadKey
    active.getOrPut(key) { ConcurrentHashMap.newKeySet() }.add(sbn.key)
    threadOf[sbn.key] = key
    replyAction(sbn.notification)?.let { replyActions[key] = it }
    sbn.notification.contentIntent?.let { openIntents[key] = it }
    packages[key] = sbn.packageName

    val now = System.currentTimeMillis()
    val store = MessageStore.get(this)
    val added = store.insert(parsed, now)
    if (++sincePurge >= 50) {
      sincePurge = 0
      store.purge(now)
    }
    if (added.isEmpty()) return false
    AlertEngine.onCaptured(this, parsed, added)
    return true
  }

  private fun removed(notificationKey: String, read: Boolean) {
    val thread = threadOf.remove(notificationKey) ?: return
    val keys = active[thread]
    keys?.remove(notificationKey)
    if (!keys.isNullOrEmpty()) return
    active.remove(thread)
    replyActions.remove(thread)
    if (read) {
      AlertEngine.onThreadRead(this, thread)
      AsterEvents.messagesChanged()
    }
  }

  /** The action with a free-text RemoteInput: the app's Reply, or its wearable copy. */
  private fun replyAction(notification: Notification): Notification.Action? {
    val wearable = try {
      Notification.WearableExtender(notification).actions
    } catch (e: Exception) {
      emptyList()
    }
    val candidates = notification.actions.orEmpty().toList() + wearable
    val replies = candidates.filter { action ->
      action.remoteInputs?.any { it.allowFreeFormInput } == true
    }
    if (Build.VERSION.SDK_INT >= 28) {
      replies.firstOrNull { it.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY }
        ?.let { return it }
    }
    return replies.firstOrNull()
  }
}
