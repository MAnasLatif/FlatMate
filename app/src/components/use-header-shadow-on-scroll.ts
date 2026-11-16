import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Shows the line under the screen's header only once content has scrolled
 * under it, so a screen at its top looks clean. Pass `onScroll` and
 * `scrollEventThrottle` to the screen's list or scroll view.
 */
export function useHeaderShadowOnScroll() {
  const navigation = useNavigation();
  const [isScrolled, setScrolled] = useState(false);

  // Set only when it changes, not on every scroll event.
  useEffect(() => {
    navigation.setOptions({ headerShadowVisible: isScrolled });
  }, [navigation, isScrolled]);

  return {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = event.nativeEvent.contentOffset.y > 0;
      setScrolled((current) => (current === next ? current : next));
    },
    scrollEventThrottle: 16,
  };
}
