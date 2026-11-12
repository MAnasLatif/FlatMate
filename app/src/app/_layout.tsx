import '@/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/lib/query-client';

export default function RootLayout() {
  return (
    // GestureHandlerRootView has to be the outermost view for HeroUI Native.
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <HeroUINativeProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </HeroUINativeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
