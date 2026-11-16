import { Image } from 'expo-image';
import { useColorScheme } from 'react-native';

const logoMark = require('@/assets/images/logo-mark.png');
const logoMarkDark = require('@/assets/images/logo-mark-dark.png');

/** FlatMate's mark, in the version for the current light or dark theme. */
export function AppLogo({ size }: { size: number }) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Image
      source={isDark ? logoMarkDark : logoMark}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="FlatMate"
    />
  );
}
