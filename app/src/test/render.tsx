import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeroUINativeProvider } from 'heroui-native';
import type { ReactElement, ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Expo Router provides safe area values in the app; tests use a fixed phone size.
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Renders a screen or component inside the providers the app's root layout gives it. */
export async function renderWithProviders(ui: ReactElement) {
  // No retries, and no cache clean-up timers keeping Jest alive after the tests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  // The styling notice HeroUI prints in development is noise in test output.
  function Providers({ children }: { children: ReactNode }) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
          <QueryClientProvider client={queryClient}>
            <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
              {children}
            </HeroUINativeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }
  return render(ui, { wrapper: Providers });
}
