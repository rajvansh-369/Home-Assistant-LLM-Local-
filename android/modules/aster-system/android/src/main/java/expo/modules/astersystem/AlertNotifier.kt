package expo.modules.astersystem

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Telephony

/**
 * 4.4's missed-message notification (docs/aster-messages-alerts-plan.md §3 4.4): "Mom · 2 missed
 * WhatsApp messages" with the quoted messages, Reply (4.2), Remind in 30 min and Open (the source
 * app). Silent: the voice is the alert, and a held one waits quietly. With "Hide message text on
 * lock screen" the lock screen shows only the title.
 */
internal object AlertNotifier {
  private const val CHANNEL = "aster-alerts"
  private const val TAG = "aster-alert"

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun ensureChannel(context: Context, name: String) {
    if (Build.VERSION.SDK_INT < 26) return
    val channel = NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_DEFAULT).apply {
      setSound(null, null)
      enableVibration(false)
    }
    manager(context).createNotificationChannel(channel)
  }

  /** The app's notification icon (expo-notifications' `notification_icon`), else the launcher's. */
  private fun icon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun builder(context: Context): Notification.Builder =
    if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(context, CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context).setDefaults(0).setSound(null)
    }

  private fun requestCode(threadKey: String, action: Int) = threadKey.hashCode() * 31 + action

  /** Opens 4.2 through the app's deep link. */
  private fun threadIntent(context: Context, threadKey: String, action: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("aster://thread/$threadKey"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context, requestCode(threadKey, action), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun remindIntent(context: Context, threadKey: String): PendingIntent {
    val intent = Intent(context, AlertReceiver::class.java)
      .setAction(AlertEngine.ACTION_REMIND)
      .setData(Uri.parse("aster-alert://remind-tap/$threadKey"))
      .putExtra(AlertEngine.EXTRA_THREAD, threadKey)
    return PendingIntent.getBroadcast(
      context, requestCode(threadKey, 2), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** The source app's package for a thread: the one that posted it, else the usual one. */
  fun packageFor(context: Context, threadKey: String, source: String): String? =
    AsterNotificationListener.packages[threadKey] ?: when (source) {
      "whatsapp" -> "com.whatsapp"
      "google_chat" -> "com.google.android.apps.dynamite"
      else -> try {
        Telephony.Sms.getDefaultSmsPackage(context)
      } catch (e: Exception) {
        null
      }
    }

  /** The source notification's own tap intent (opens the chat), else the app's launcher. */
  fun openIntent(context: Context, threadKey: String, source: String): PendingIntent? {
    AsterNotificationListener.openIntents[threadKey]?.let { return it }
    val pkg = packageFor(context, threadKey, source) ?: return null
    val launch = context.packageManager.getLaunchIntentForPackage(pkg) ?: return null
    return PendingIntent.getActivity(
      context, requestCode(threadKey, 3), launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun post(context: Context, config: AlertConfig, threadKey: String, name: String, source: String, texts: List<String>) {
    val copy = config.copy
    ensureChannel(context, copy.channel)
    val title = AlertRules.title(config, name, source, texts.size)
    val quoted = texts.takeLast(AlertRules.MAX_SPOKEN).map { "“${it.trim()}”" }
    val color = try {
      Color.parseColor(config.accent)
    } catch (e: Exception) {
      Color.WHITE
    }
    val base = builder(context)
      .setSmallIcon(icon(context))
      .setColor(color)
      .setContentTitle(title)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(threadIntent(context, threadKey, 0))

    val notification = builder(context)
      .setSmallIcon(icon(context))
      .setColor(color)
      .setContentTitle(title)
      .setContentText(quoted.last())
      .setStyle(Notification.BigTextStyle().bigText(quoted.joinToString("\n")))
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(threadIntent(context, threadKey, 0))
      .addAction(Notification.Action.Builder(null, copy.reply, threadIntent(context, threadKey, 1)).build())
      .addAction(Notification.Action.Builder(null, copy.remind, remindIntent(context, threadKey)).build())
      .apply {
        openIntent(context, threadKey, source)?.let {
          addAction(Notification.Action.Builder(null, copy.open, it).build())
        }
        if (config.hideOnLockScreen) {
          setVisibility(Notification.VISIBILITY_PRIVATE)
          setPublicVersion(base.build())
        } else {
          setVisibility(Notification.VISIBILITY_PUBLIC)
        }
      }
      .build()
    try {
      manager(context).notify(TAG, threadKey.hashCode(), notification)
    } catch (e: SecurityException) {
      // Notifications not allowed (Android 13+): the voice was the alert.
    }
  }

  fun cancel(context: Context, threadKey: String) {
    manager(context).cancel(TAG, threadKey.hashCode())
  }

  fun cancelAll(context: Context) {
    val manager = manager(context)
    manager.activeNotifications.filter { it.tag == TAG }.forEach { manager.cancel(TAG, it.id) }
  }
}
