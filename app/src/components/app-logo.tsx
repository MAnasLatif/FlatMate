import { Image } from 'expo-image';
import { useColorScheme, View } from 'react-native';

const logoMark = require('@/assets/images/logo-mark.png');
const logoMarkDark = require('@/assets/images/logo-mark-dark.png');

/**
 * Where the drawing sits in the logo images (both 1024px square), as fractions
 * of the image: everything outside it is transparent padding. Measure again if
 * the images change.
 */
const MARK_BOUNDS = { left: 229 / 1024, top: 216 / 1024, width: 566 / 1024, height: 586 / 1024 };

/**
 * FlatMate's mark, in the version for the current light or dark theme. `size`
 * is the whole image, padding included. With `markHeight` instead, the box is
 * just the drawing, that many points tall, so it lines up with text beside it.
 */
export function AppLogo(props: { size: number } | { markHeight: number }) {
  const isDark = useColorScheme() === 'dark';
  const size = 'size' in props ? props.size : props.markHeight / MARK_BOUNDS.height;
  const image = (
    <Image
      source={isDark ? logoMarkDark : logoMark}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="FlatMate"
    />
  );
  if ('size' in props) return image;

  return (
    <View
      style={{
        width: size * MARK_BOUNDS.width,
        height: size * MARK_BOUNDS.height,
        overflow: 'hidden',
      }}
    >
      <View style={{ marginLeft: -size * MARK_BOUNDS.left, marginTop: -size * MARK_BOUNDS.top }}>
        {image}
      </View>
    </View>
  );
}
