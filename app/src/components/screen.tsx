import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  /** Scroll the content. Turn off for screens that manage their own list. */
  scroll?: boolean;
  /** Pad for the status bar. Off for screens under a navigation header. */
  padTop?: boolean;
};

/** Page container: theme background, safe areas, and room for the keyboard. */
export function Screen({ children, scroll = true, padTop = true }: ScreenProps) {
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
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-6 px-5" style={padding}>
          {children}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
