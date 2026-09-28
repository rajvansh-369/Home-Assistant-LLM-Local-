package expo.modules.astersystem

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The alert engine's alarms (missed and remind timers) and the missed notification's "Remind in
 * 30 min" button (docs/aster-messages-alerts-plan.md §7). Work runs on the message store's thread;
 * speaking carries on after the broadcast ends, in the listener's process.
 */
class AlertReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val thread = intent.getStringExtra(AlertEngine.EXTRA_THREAD) ?: return
    val app = context.applicationContext
    val pending = goAsync()
    Worker.run {
      try {
        when (intent.action) {
          AlertEngine.ACTION_TIMER ->
            AlertEngine.onTimer(app, thread, intent.getStringExtra(AlertEngine.EXTRA_KIND) ?: AlertEngine.MISSED)
          AlertEngine.ACTION_REMIND -> AlertEngine.remindLater(app, thread)
        }
      } finally {
        pending.finish()
      }
    }
  }
}
