// Tests always run against the mock server (src/services/api/mock.ts).
process.env.EXPO_PUBLIC_USE_MOCK_API = '1';

// Reanimated 4 runs on react-native-worklets, which has no native runtime under Jest.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();

jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

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
// enabled and every settings screen "opens"; tests override per case. Messages live in `__state`
// (threads, messages per thread key), which tests fill; `__emit` fires a native event.
jest.mock('./modules/aster-system', () => {
  const listeners = new Map();
  const fresh = () => ({
    threads: [],
    messages: {},
    seen: [],
    replies: [],
    replyResult: 'sent',
    spoken: [],
    config: null,
    atHome: false,
    llmAccess: null,
    activity: [],
  });
  const state = fresh();
  return {
    __esModule: true,
    default: {
      __state: state,
      __reset() {
        Object.assign(state, fresh());
        listeners.clear();
      },
      __emit(event) {
        (listeners.get(event) ?? []).forEach((listener) => listener());
      },
      isNotificationListenerEnabled: jest.fn(() => false),
      openNotificationListenerSettings: jest.fn(() => true),
      isIgnoringBatteryOptimizations: jest.fn(() => false),
      requestIgnoreBatteryOptimizations: jest.fn(() => true),
      listThreads: jest.fn(async () => state.threads.map((thread) => ({ ...thread }))),
      threadMessages: jest.fn(async (key) => [...(state.messages[key] ?? [])]),
      markThreadSeen: jest.fn(async (key) => {
        state.seen.push(key);
        state.threads = state.threads.map((t) => (t.key === key ? { ...t, unreadSenders: [] } : t));
      }),
      sendReply: jest.fn(async (key, text) => {
        if (state.replyResult === 'sent') state.replies.push({ key, text });
        return state.replyResult;
      }),
      openSourceApp: jest.fn(() => true),
      clearMessages: jest.fn(async () => {
        state.threads = [];
        state.messages = {};
        state.activity = [];
        state.config = null;
      }),
      setAlertConfig: jest.fn((json) => {
        state.config = json;
      }),
      setAtHome: jest.fn((atHome) => {
        state.atHome = atHome;
      }),
      setLlmAccess: jest.fn((url, token, expiresAt) => {
        state.llmAccess = url && token ? { url, expiresAt } : null;
      }),
      speak: jest.fn(async (text) => {
        state.spoken.push(text);
        return true;
      }),
      stopSpeaking: jest.fn(),
      takeActivity: jest.fn(() => {
        const out = JSON.stringify(state.activity);
        state.activity = [];
        return out;
      }),
      addListener: jest.fn((event, listener) => {
        const list = listeners.get(event) ?? [];
        listeners.set(event, [...list, listener]);
        return {
          remove: () =>
            listeners.set(
              event,
              (listeners.get(event) ?? []).filter((l) => l !== listener),
            ),
        };
      }),
    },
  };
});

// react-native-maps looks up its native module on import; tests only need the components.
jest.mock('react-native-maps', () => {
  const { createElement, forwardRef } = require('react');
  const { View } = require('react-native');
  const MapView = forwardRef(function MapView(props, ref) {
    return createElement(
      View,
      { ref, testID: 'map', accessibilityLabel: props.accessibilityLabel },
      props.children,
    );
  });
  const Shape = () => null;
  const Marker = (props) => createElement(View, null, props.children);
  return {
    __esModule: true,
    default: MapView,
    Circle: Shape,
    Marker,
    Polyline: Shape,
    PROVIDER_GOOGLE: 'google',
  };
});

// expo-notifications has no native side under Jest: an in-memory schedule and tray. Tests read
// and reset them through `__scheduled`, `__presented` and `__reset`.
jest.mock('expo-notifications', () => {
  const scheduled = new Map();
  const presented = new Map();
  const permission = { granted: true, canAskAgain: true, status: 'granted' };
  return {
    __scheduled: scheduled,
    __presented: presented,
    __permission: permission,
    __reset() {
      scheduled.clear();
      presented.clear();
      Object.assign(permission, { granted: true, canAskAgain: true, status: 'granted' });
    },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
    SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    setNotificationCategoryAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ ...permission })),
    requestPermissionsAsync: jest.fn(async () => ({ ...permission })),
    scheduleNotificationAsync: jest.fn(async ({ identifier, content, trigger }) => {
      const id = identifier ?? `n${scheduled.size + presented.size + 1}`;
      if (trigger && trigger.type === 'date')
        scheduled.set(id, { identifier: id, content, trigger });
      else presented.set(id, { identifier: id, content });
      return id;
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled.values()]),
    cancelScheduledNotificationAsync: jest.fn(async (id) => void scheduled.delete(id)),
    dismissNotificationAsync: jest.fn(async (id) => void presented.delete(id)),
    registerTaskAsync: jest.fn(async () => null),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    getLastNotificationResponseAsync: jest.fn(async () => null),
    clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  };
});

// Android's date and time dialogs; tests call the onChange they were given.
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));
