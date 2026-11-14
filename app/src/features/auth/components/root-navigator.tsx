import * as SplashScreen from 'expo-splash-screen';
import Stack from 'expo-router/stack';
import { useEffect } from 'react';

import { switchTransition } from '@/components/screen-transitions';

import { useSession } from '../session-provider';

/**
 * The switch between signed-in and signed-out screens. It renders nothing
 * until useSession is done loading, while the splash screen is up.
 */
export function RootNavigator() {
  const { session, isLoading, isRestoring, isNavigationHeld } = useSession();

  // The splash stays up until the session is read and, for someone already
  // signed in, their saved data is restored (useSession's isLoading).
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  // After a sign-in, signed-in screens wait for that user's restore. The
  // navigator stays mounted meanwhile, so a flow such as a password reset that
  // creates a session is not interrupted.
  const isSignedIn = session !== null && !isNavigationHeld && !isRestoring;

  return (
    // Each guard names where it sends someone. Without that, the router falls
    // back to the root navigator's anchor, which this app does not declare,
    // and shows "not found" instead of the sign-in or home screen.
    <Stack screenOptions={{ headerShown: false, ...switchTransition }}>
      <Stack.Protected guard={isSignedIn} redirectTo="/sign-in">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
