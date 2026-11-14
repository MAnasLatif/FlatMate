import 'react-native-gesture-handler/jestSetup';

// expo-sqlite is a native module, and it imports expo-asset from inside the
// expo package, where Metro finds it and Jest does not. Its key-value store is
// replaced by an in-memory one; tests of the saved cache pass their own store.
jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => items.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        items.set(key, value);
      },
      removeItem: async (key: string) => {
        items.delete(key);
      },
    },
  };
});

// expo-notifications is a native module, and in Jest it behaves as in Expo Go,
// where Android push is unavailable. Tests see a device without permission.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test-token-000001]' })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  useLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
}));

// NetInfo is a native module. Its own mock reports a connected device.
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

// Reanimated and its worklets runtime need native modules that do not exist
// under Jest. Both libraries ship mocks for this.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// HeroUI's BottomSheet is built on @gorhom/bottom-sheet, whose gesture and
// layout code needs a device. The package ships a mock that renders plain views.
jest.mock('@gorhom/bottom-sheet', () => jest.requireActual('@gorhom/bottom-sheet/mock'));

// Gesture Handler's swipeable row needs Reanimated shared values that its mock
// does not provide. This stand-in renders the row and its actions, and passes
// onSwipeableOpen through, so a test can fire fireEvent(row, 'swipeableOpen', 'right').
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { createElement, forwardRef, useImperativeHandle } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const SwipeDirection = { LEFT: 'left', RIGHT: 'right' };
  const ReanimatedSwipeable = forwardRef(
    (
      props: {
        children?: unknown;
        testID?: string;
        onSwipeableOpen?: (direction: string) => void;
      },
      ref: unknown,
    ) => {
      useImperativeHandle(ref, () => ({ close: () => undefined, reset: () => undefined }));
      return createElement(
        View,
        { testID: props.testID ?? 'swipeable-row', onSwipeableOpen: props.onSwipeableOpen },
        props.children,
      );
    },
  );
  return { __esModule: true, default: ReanimatedSwipeable, SwipeDirection };
});

// Reanimated 4.7's native initializer registers a CSS animation event handler,
// which its JavaScript fallback used under Jest does not implement.
jest.mock('react-native-reanimated/src/css/native', () => ({
  ...jest.requireActual('react-native-reanimated/src/css/native'),
  setCSSEventHandler: () => undefined,
}));

// @expo/vector-icons loads its fonts through expo-asset, which npm installs
// inside the expo package. Metro finds it there and Jest does not. Icons are
// decoration in tests, so they render nothing.
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

// Theme colours are CSS variables that Uniwind compiles through Metro, so they
// do not exist under Jest and HeroUI falls back to black. These three messages
// are expected in tests; every other warning and error still prints.
const EXPECTED_THEME_MESSAGES = [
  "Uniwind - We couldn't find your variable",
  '[colorKit.RGB] An error occurred while attempting to convert',
  'is not a valid color or brush',
];

function isExpectedThemeMessage(args: unknown[]): boolean {
  const first = args[0];
  return (
    typeof first === 'string' && EXPECTED_THEME_MESSAGES.some((message) => first.includes(message))
  );
}

for (const method of ['warn', 'error'] as const) {
  const original = console[method];
  jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    if (!isExpectedThemeMessage(args)) {
      original(...args);
    }
  });
}
