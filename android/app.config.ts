import type { ConfigContext, ExpoConfig } from 'expo/config';

// Values come from .env (loaded by the Expo CLI). See .env.example.
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE;
if (!ANDROID_PACKAGE) {
  throw new Error('ANDROID_PACKAGE is missing. Copy .env.example to .env and fill it in.');
}

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
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: BACKGROUND }],
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
