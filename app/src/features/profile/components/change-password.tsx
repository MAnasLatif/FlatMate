import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { useForm } from 'react-hook-form';
import { Alert, View } from 'react-native';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { PasswordField } from '@/components/form/password-field';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import { updatePassword } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from '@/features/auth/schemas';

/** The change-password modal opened from the profile screen. */
export function ChangePassword() {
  const form = useForm<
    z.input<typeof changePasswordSchema>,
    unknown,
    z.output<typeof changePasswordSchema>
  >({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '' },
  });
  const change = useMutation({
    mutationFn: (password: string) => updatePassword(password),
    onSuccess: () => {
      router.back();
      Alert.alert('Password changed', 'Use your new password the next time you sign in.');
    },
  });

  return (
    <Screen padTop={false}>
      <FormAlert message={change.error ? authErrorMessage(change.error) : null} />
      <PasswordField
        control={form.control}
        name="password"
        label="New password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        purpose="new"
        autoFocus
      />
      <View className="gap-3">
        <OnlineButton
          onPress={() => void form.handleSubmit((values) => change.mutate(values.password))()}
          isDisabled={change.isPending}
        >
          {change.isPending ? 'Saving…' : 'Change password'}
        </OnlineButton>
        <Button variant="ghost" onPress={() => router.back()} isDisabled={change.isPending}>
          Cancel
        </Button>
      </View>
    </Screen>
  );
}
