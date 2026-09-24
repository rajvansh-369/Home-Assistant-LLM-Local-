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
