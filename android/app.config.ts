import type { ConfigContext, ExpoConfig } from 'expo/config';

// Values come from .env (loaded by the Expo CLI). See .env.example.
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE;
if (!ANDROID_PACKAGE) {
  throw new Error('ANDROID_PACKAGE is missing. Copy .env.example to .env and fill it in.');
}

// 1.4 map. Without a key Google Maps would crash, so the screen falls back to a blank map.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? '';
if (!GOOGLE_MAPS_API_KEY) {
  console.warn('GOOGLE_MAPS_API_KEY is empty: 1.4 Set home shows no map. See .env.example.');
}

// The only host a release build may call over plain HTTP (plan §7).
const HOME_LLM_HOST = process.env.HOME_LLM_HOST?.trim() ?? '';

const BACKGROUND = '#0C1015';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Aster',
  slug: 'aster',
  scheme: 'aster',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: BACKGROUND,
  platforms: ['android'],
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: BACKGROUND,
    },
    predictiveBackGestureEnabled: false,
    // 1.5 Permissions (plan §7). Location comes from the expo-location plugin below; battery
    // and the notification listener from modules/aster-system.
    permissions: [
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.READ_CONTACTS',
      // NetInfo's Wi-Fi name on 1.4.
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.ACCESS_NETWORK_STATE',
    ],
  },
  plugins: [
    'expo-router',
    // The Aster orb on the dark background (Android 12+ splash icon).
    ['expo-splash-screen', { backgroundColor: BACKGROUND, image: './assets/splash-icon.png', imageWidth: 120 }],
    'expo-secure-store',
    // "Allow all the time" for the home geofence. The location foreground service belongs to a
    // later row (spoken alerts), so it stays off for now.
    [
      'expo-location',
      { isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: false },
    ],
    ['react-native-maps', { androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY }],
    ['./plugins/with-home-llm-cleartext.js', { host: HOME_LLM_HOST }],
  ],
  extra: {
    ...config.extra,
    // Read at run time through src/services/buildConfig.ts. Empty string, not null: Expo's
    // config serializer turns null into {} in the release build's embedded app.config.
    homeLlmHost: HOME_LLM_HOST,
    hasMapsKey: GOOGLE_MAPS_API_KEY !== '',
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
