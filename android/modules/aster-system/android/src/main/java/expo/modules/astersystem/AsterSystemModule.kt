package expo.modules.astersystem

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Special access that has no runtime prompt (plan §7): notification access and battery. */
class AsterSystemModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val listenerComponent: ComponentName
    get() = ComponentName(context, AsterNotificationListener::class.java)

  override fun definition() = ModuleDefinition {
    Name("AsterSystem")

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
