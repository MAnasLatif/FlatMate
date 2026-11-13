import '@/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider, useThemeColor } from 'heroui-native';
import { type ReactNode, useEffect, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider, useSession } from '@/features/auth/session-provider';
import { queryClient } from '@/lib/query-client';

// Keep the splash screen up until the stored session has been read, so the
// sign-in screen never flashes for someone who is already signed in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    // GestureHandlerRootView has to be the outermost view for HeroUI Native.
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <HeroUINativeProvider>
          <NavigationTheme>
            <SessionProvider>
              <RootNavigator />
              <StatusBar style="auto" />
            </SessionProvider>
          </NavigationTheme>
        </HeroUINativeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading, isNavigationHeld } = useSession();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  const isSignedIn = session !== null && !isNavigationHeld;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Gives navigation headers and backgrounds the HeroUI theme colours. */
function NavigationTheme({ children }: { children: ReactNode }) {
  const isDark = useColorScheme() === 'dark';
  const [background, foreground, accent, border] = useThemeColor([
    'background',
    'foreground',
    'accent',
    'border',
  ]);

  const theme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background,
        card: background,
        text: foreground,
        primary: accent,
        border,
      },
    };
  }, [isDark, background, foreground, accent, border]);

  return <ThemeProvider value={theme}>{children}</ThemeProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
