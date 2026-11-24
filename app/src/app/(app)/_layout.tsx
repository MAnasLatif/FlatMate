import Stack from 'expo-router/stack';

import { modalTransition, pushTransition } from '@/components/screen-transitions';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useSendQueuedExpenses } from '@/features/expenses/offline-queue-hooks';
import { useOpenTappedNotification, usePushRegistration } from '@/features/notifications/hooks';
import { useUserChanges } from '@/features/sync/hooks';

export default function AppLayout() {
  // The user's own data stays current on every device while they are signed in.
  const userId = useCurrentUserId();
  useUserChanges(userId);
  // Push notifications reach this device, and tapping one opens its record.
  usePushRegistration(userId);
  useOpenTappedNotification(userId);
  // Expenses saved offline are sent by themselves once the connection is back.
  useSendQueuedExpenses(userId);

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        // No line under the header.
        headerShadowVisible: false,
        ...pushTransition,
      }}
    >
      <Stack.Screen name="(home)" options={{ headerShown: false }} />
      <Stack.Screen name="apartments/index" options={{ title: 'Your apartments' }} />
      <Stack.Screen name="change-email" options={{ title: 'Change email', ...modalTransition }} />
      <Stack.Screen
        name="change-password"
        options={{ title: 'Change password', ...modalTransition }}
      />
      <Stack.Screen name="apartments/new" options={{ title: 'New apartment' }} />
      <Stack.Screen name="apartments/join" options={{ title: 'Join an apartment' }} />
      <Stack.Screen name="accounts/[accountId]" options={{ title: 'Account' }} />
      <Stack.Screen
        name="accounts/edit"
        options={{ title: 'Bank or wallet account', ...modalTransition }}
      />
      <Stack.Screen name="apartments/[apartmentId]" options={{ headerShown: false }} />
    </Stack>
  );
}
