import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
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
  const padding = {
    paddingTop: padTop ? insets.top + 16 : 16,
    paddingBottom: insets.bottom + 16,
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {scroll ? (
        <ScrollView
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
