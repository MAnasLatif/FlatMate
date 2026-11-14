import Stack from 'expo-router/stack';

import { modalTransition, pushTransition } from '@/components/screen-transitions';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useOpenTappedNotification, usePushRegistration } from '@/features/notifications/hooks';
import { useUserChanges } from '@/features/sync/hooks';

export default function AppLayout() {
  // The user's own data stays current on every device while they are signed in.
  const userId = useCurrentUserId();
  useUserChanges(userId);
  // Push notifications reach this device, and tapping one opens its record.
  usePushRegistration(userId);
  useOpenTappedNotification(userId);

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', ...pushTransition }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="apartments/new" options={{ title: 'New apartment' }} />
      <Stack.Screen
        name="accounts/edit"
        options={{ title: 'Receiving account', ...modalTransition }}
      />
      <Stack.Screen name="apartments/[apartmentId]" options={{ headerShown: false }} />
    </Stack>
  );
}
