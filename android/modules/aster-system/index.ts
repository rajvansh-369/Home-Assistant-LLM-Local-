// Aster's local Expo module (Kotlin, Android only). See plan §7 and android/src/main/java.
import { requireOptionalNativeModule } from 'expo';

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

const native = requireOptionalNativeModule<AsterSystemModule>('AsterSystem');

if (!native && __DEV__) {
  console.warn(
    'AsterSystem native module missing (Expo Go, or a build older than Phase 6): Notification ' +
      'access and Run in background on 1.5 do nothing. Use a development build: npx expo run:android.',
  );
}

/** Stand-in when the native side is missing: nothing is allowed and no screen opens. */
const unavailable: AsterSystemModule = {
  isNotificationListenerEnabled: () => false,
  openNotificationListenerSettings: () => false,
  isIgnoringBatteryOptimizations: () => false,
  requestIgnoreBatteryOptimizations: () => false,
};

export default native ?? unavailable;
