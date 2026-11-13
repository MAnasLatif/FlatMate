import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { Screen } from '@/components/screen';
import { signUpWithEmail } from '@/features/auth/api';
import { AuthHeader } from '@/features/auth/components/auth-header';
import { GoogleSignInButton } from '@/features/auth/components/google-sign-in-button';
import { authErrorMessage } from '@/features/auth/errors';
import { PASSWORD_MIN_LENGTH, signUpSchema } from '@/features/auth/schemas';

type FormInput = z.input<typeof signUpSchema>;
type FormOutput = z.output<typeof signUpSchema>;

export default function SignUpScreen() {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const signUp = useMutation({
    mutationFn: signUpWithEmail,
    onSuccess: ({ needsEmailConfirmation }, values) => {
      // Without email confirmation the user is already signed in, and the
      // navigator switches to the app on its own.
      if (needsEmailConfirmation) {
        router.push({ pathname: '/verify-email', params: { email: values.email } });
      }
    },
  });

  return (
    <Screen>
      <AuthHeader
        title="Create your account"
        subtitle="Track shared costs with the people you live with."
      />

      <FormAlert message={signUp.error ? authErrorMessage(signUp.error) : null} />

      <View className="gap-4">
        <TextInputField
          control={form.control}
          name="displayName"
          label="Your name"
          description="Your flatmates see this name."
          autoComplete="name"
          textContentType="name"
        />
        <TextInputField
          control={form.control}
          name="email"
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextInputField
          control={form.control}
          name="password"
          label="Password"
          description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </View>

      <Button
        onPress={() => void form.handleSubmit((values) => signUp.mutate(values))()}
        isDisabled={signUp.isPending}
      >
        {signUp.isPending ? 'Creating account…' : 'Create account'}
      </Button>

      <GoogleSignInButton />

      <Button variant="ghost" onPress={() => router.back()}>
        I already have an account
      </Button>
    </Screen>
  );
}
