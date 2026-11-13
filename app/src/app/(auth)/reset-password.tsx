import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { Screen } from '@/components/screen';
import { updatePassword, verifyPasswordResetCode } from '@/features/auth/api';
import { AuthHeader } from '@/features/auth/components/auth-header';
import { EmailCodeField } from '@/features/auth/components/email-code-field';
import { authErrorMessage } from '@/features/auth/errors';
import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from '@/features/auth/schemas';
import { useSession } from '@/features/auth/session-provider';

type FormInput = z.input<typeof resetPasswordSchema>;
type FormOutput = z.output<typeof resetPasswordSchema>;

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { setNavigationHeld } = useSession();
  // A reset code can be used only once. After it is accepted, a retry only
  // sets the password again.
  const codeAccepted = useRef(false);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '' },
  });

  // Accepting the code signs the user in. Hold the switch to the app until
  // the new password is saved, and release it if the user leaves.
  useEffect(() => () => setNavigationHeld(false), [setNavigationHeld]);

  const reset = useMutation({
    mutationFn: async (values: FormOutput) => {
      if (!email) throw new Error('Missing email.');
      setNavigationHeld(true);
      if (!codeAccepted.current) {
        await verifyPasswordResetCode(email, values.code);
        codeAccepted.current = true;
      }
      await updatePassword(values.password);
    },
    onSuccess: () => setNavigationHeld(false),
    onError: () => {
      if (!codeAccepted.current) {
        setNavigationHeld(false);
      }
    },
  });

  if (!email) {
    return (
      <Screen>
        <AuthHeader title="Reset your password" subtitle="Start again to get a new code." />
        <Button onPress={() => router.replace('/forgot-password')}>Get a code</Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader
        title="Choose a new password"
        subtitle={`If an account exists for ${email}, we sent it a 6-digit code.`}
      />

      <FormAlert message={reset.error ? authErrorMessage(reset.error) : null} />

      <Controller
        control={form.control}
        name="code"
        render={({ field, fieldState }) => (
          <EmailCodeField
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <TextInputField
        control={form.control}
        name="password"
        label="New password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <Button
        onPress={() => void form.handleSubmit((values) => reset.mutate(values))()}
        isDisabled={reset.isPending}
      >
        {reset.isPending ? 'Saving…' : 'Save new password'}
      </Button>

      <Button variant="ghost" onPress={() => router.replace('/forgot-password')}>
        Send a new code
      </Button>
    </Screen>
  );
}
