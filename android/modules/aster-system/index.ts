// Aster's local Expo module (Kotlin, Android only). See plan §7 and android/src/main/java.
import { requireNativeModule } from 'expo';

type AsterSystemModule = {
  /** Aster is in the list of enabled notification listeners. */
  isNotificationListenerEnabled(): boolean;
  /** Opens Notification access (Aster's own page on Android 11+). False if nothing opened. */
  openNotificationListenerSettings(): boolean;
  /** Battery use is "Unrestricted". */
  isIgnoringBatteryOptimizations(): boolean;
  /** Shows the system dialog that turns battery optimisation off for Aster. */
  requestIgnoreBatteryOptimizations(): boolean;
};

export default requireNativeModule<AsterSystemModule>('AsterSystem');
