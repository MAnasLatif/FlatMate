import 'react-native-gesture-handler/jestSetup';

// Reanimated and its worklets runtime need native modules that do not exist
// under Jest. Both libraries ship mocks for this.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

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
