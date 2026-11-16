import { router, useLocalSearchParams } from 'expo-router';
import { Button, Spinner } from 'heroui-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { exchangeAuthCallbackUrl } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session-provider';

/**
 * Landing route for flatmate://auth/callback. Google sign-in normally finishes
 * inside the browser session, but if the operating system delivers the
 * redirect to the app instead, the code is exchanged here.
 */
export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session } = useSession();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (session || typeof code !== 'string') {
      router.replace('/');
      return;
    }
    exchangeAuthCallbackUrl(`flatmate://auth/callback?code=${encodeURIComponent(code)}`)
      .then(() => router.replace('/'))
      .catch(setError);
  }, [code, session]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      {error ? (
        <>
          <FormAlert message={authErrorMessage(error)} />
          <Button onPress={() => router.replace('/sign-in')}>Back to sign in</Button>
        </>
      ) : (
        <Spinner accessibilityLabel="Signing you in" />
      )}
    </View>
  );
}
