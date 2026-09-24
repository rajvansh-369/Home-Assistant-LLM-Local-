// Reanimated 4 runs on react-native-worklets, which has no native runtime under Jest.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();

jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
