// Tests always run against the mock server (src/services/api/mock.ts).
process.env.EXPO_PUBLIC_USE_MOCK_API = '1';

// Reanimated 4 runs on react-native-worklets, which has no native runtime under Jest.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();

jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// In-memory secure store; requireAuthentication has no prompt under Jest.
jest.mock('expo-secure-store', () => {
  const items = new Map();
  return {
    getItemAsync: jest.fn(async (key) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => void items.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => void items.delete(key)),
  };
});

// The local Kotlin module (modules/aster-system) has no native side under Jest. Nothing is
// enabled and every settings screen "opens"; tests override per case.
jest.mock('./modules/aster-system', () => ({
  __esModule: true,
  default: {
    isNotificationListenerEnabled: jest.fn(() => false),
    openNotificationListenerSettings: jest.fn(() => true),
    isIgnoringBatteryOptimizations: jest.fn(() => false),
    requestIgnoreBatteryOptimizations: jest.fn(() => true),
  },
}));

// react-native-maps looks up its native module on import; tests only need the components.
jest.mock('react-native-maps', () => {
  const { createElement, forwardRef } = require('react');
  const { View } = require('react-native');
  const MapView = forwardRef(function MapView(props, ref) {
    return createElement(View, { ref, testID: 'map', accessibilityLabel: props.accessibilityLabel }, props.children);
  });
  const Shape = () => null;
  const Marker = (props) => createElement(View, null, props.children);
  return { __esModule: true, default: MapView, Circle: Shape, Marker, Polyline: Shape, PROVIDER_GOOGLE: 'google' };
});
