import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import { requestPasswordReset } from '@/features/auth/api';
import { AuthFooterLink } from '@/features/auth/components/auth-footer-link';
import { AuthHeader } from '@/features/auth/components/auth-header';
import { authErrorMessage } from '@/features/auth/errors';
import { requestPasswordResetSchema } from '@/features/auth/schemas';

type FormInput = z.input<typeof requestPasswordResetSchema>;
type FormOutput = z.output<typeof requestPasswordResetSchema>;

export default function ForgotPasswordScreen() {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  const request = useMutation({
    mutationFn: (values: FormOutput) => requestPasswordReset(values.email),
    onSuccess: (_result, values) => {
      router.push({ pathname: '/reset-password', params: { email: values.email } });
    },
  });

  return (
    <Screen>
      <View className="flex-1 gap-8">
        <AuthHeader
          title="Reset your password"
          subtitle="Enter your email and we will send you a code to choose a new password."
        />

        <FormAlert message={request.error ? authErrorMessage(request.error) : null} />

        <TextInputField
          control={form.control}
          name="email"
          label="Email"
          icon="mail-outline"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
        />

        <OnlineButton
          size="lg"
          onPress={() => void form.handleSubmit((values) => request.mutate(values))()}
          isDisabled={request.isPending}
        >
          {request.isPending ? 'Sending…' : 'Send code'}
        </OnlineButton>
      </View>

      <AuthFooterLink
        prompt="Remembered it?"
        action="Back to sign in"
        onPress={() => router.back()}
      />
    </Screen>
  );
}
