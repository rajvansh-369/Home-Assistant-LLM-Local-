package expo.modules.astersystem

import android.service.notification.NotificationListenerService

/**
 * Stub listener so Aster appears in Settings > Notification access (plan §7).
 * Message capture arrives with row 4; until then it receives nothing and does nothing.
 */
class AsterNotificationListener : NotificationListenerService()
