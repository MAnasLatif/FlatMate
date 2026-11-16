import { useMutation } from '@tanstack/react-query';
import { Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { getEnv } from '@/lib/env';

import { signInWithGoogle } from '../api';
import { authErrorMessage } from '../errors';

/**
 * "Continue with Google", under an "or" divider. Hidden, divider included,
 * unless EXPO_PUBLIC_AUTH_GOOGLE_ENABLED is true.
 */
export function GoogleSignInButton() {
  const signIn = useMutation({ mutationFn: signInWithGoogle });

  if (!getEnv().EXPO_PUBLIC_AUTH_GOOGLE_ENABLED) {
    return null;
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3" accessibilityElementsHidden>
        <Separator className="flex-1" />
        <Typography.Paragraph type="body-sm" color="muted">
          or
        </Typography.Paragraph>
        <Separator className="flex-1" />
      </View>
      <FormAlert message={signIn.error ? authErrorMessage(signIn.error) : null} />
      <OnlineButton
        variant="secondary"
        onPress={() => signIn.mutate()}
        isDisabled={signIn.isPending}
      >
        {signIn.isPending ? 'Opening Google…' : 'Continue with Google'}
      </OnlineButton>
    </View>
  );
}
