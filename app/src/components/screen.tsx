import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Freshness, FreshnessBanner } from './freshness-banner';

type ScreenProps = {
  children: ReactNode;
  /** Scroll the content. Turn off for screens that manage their own list. */
  scroll?: boolean;
  /** Pad for the status bar. Off for screens under a navigation header. */
  padTop?: boolean;
  /** Pull to refresh, for screens that show server data. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * The screen's main query, so the offline banner can say when its data was
   * last updated and a failed refresh is reported over saved data. The banner
   * shows offline on every screen, with or without this.
   */
  freshness?: Freshness;
};

/** Page container: theme background, safe areas, and room for the keyboard. */
export function Screen({
  children,
  scroll = true,
  padTop = true,
  refreshing = false,
  onRefresh,
  freshness,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollFocusedInputIntoView(scrollRef);
  const padding = {
    paddingTop: padTop ? insets.top + 16 : 16,
    paddingBottom: insets.bottom + 16,
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      // Android draws edge to edge, so the window no longer shrinks for the
      // keyboard; padding makes the room on both platforms.
      behavior="padding"
    >
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="grow gap-6 px-5"
          contentContainerStyle={padding}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          <FreshnessBanner freshness={freshness} />
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-6 px-5" style={padding}>
          <FreshnessBanner freshness={freshness} />
          {children}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Space kept between the field being typed in and the top of the keyboard. */
const FOCUSED_INPUT_MARGIN = 96;

/**
 * When the keyboard opens, scrolls the field being typed in up so it sits above
 * the keyboard instead of behind it. Fields already in view stay where they are.
 */
function useScrollFocusedInputIntoView(scrollRef: RefObject<ScrollViewInstance | null>) {
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const input = TextInput.State.currentlyFocusedInput();
      const scroll = scrollRef.current;
      if (!input || !scroll) return;
      input.measureInWindow((_x, inputY, _width, inputHeight) => {
        const keyboardTop = event.endCoordinates.screenY;
        const overlap = inputY + inputHeight + FOCUSED_INPUT_MARGIN - keyboardTop;
        if (overlap <= 0) return;
        scroll.scrollResponderScrollNativeHandleToKeyboard(input, FOCUSED_INPUT_MARGIN, true);
      });
    });
    return () => subscription.remove();
  }, [scrollRef]);
}
