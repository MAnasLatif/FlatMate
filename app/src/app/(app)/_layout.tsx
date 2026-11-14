import Stack from 'expo-router/stack';

import { useCurrentUserId } from '@/features/auth/session-provider';
import { useUserChanges } from '@/features/sync/hooks';

export default function AppLayout() {
  // The user's own data stays current on every device while they are signed in.
  useUserChanges(useCurrentUserId());

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="apartments/new" options={{ title: 'New apartment' }} />
      <Stack.Screen
        name="accounts/edit"
        options={{ title: 'Receiving account', presentation: 'modal' }}
      />
      <Stack.Screen name="apartments/[apartmentId]" options={{ headerShown: false }} />
    </Stack>
  );
}
