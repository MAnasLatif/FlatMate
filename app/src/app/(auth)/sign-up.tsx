import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { PasswordField } from '@/components/form/password-field';
import { TextInputField } from '@/components/form/text-input-field';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import { signUpWithEmail } from '@/features/auth/api';
import { AuthFooterLink } from '@/features/auth/components/auth-footer-link';
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
        // A code was just sent, so the resend countdown starts at once.
        router.push({ pathname: '/verify-email', params: { email: values.email, codeSent: '1' } });
      }
    },
  });

  return (
    <Screen>
      <View className="flex-1 gap-8">
        <AuthHeader
          title="Create your account"
          subtitle="Split shared costs fairly with the people you live with."
        />

        <FormAlert message={signUp.error ? authErrorMessage(signUp.error) : null} />

        <View className="gap-4">
          <TextInputField
            control={form.control}
            name="displayName"
            label="Your name"
            icon="person-outline"
            placeholder="How flatmates know you"
            description="Your flatmates see this name."
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />
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
            // The account's identifier, so a password manager saves it with the password.
            textContentType="username"
          />
          <PasswordField
            control={form.control}
            name="password"
            label="Password"
            placeholder="Create a password"
            description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            purpose="new"
          />
        </View>

        <View className="gap-3">
          <OnlineButton
            onPress={() => void form.handleSubmit((values) => signUp.mutate(values))()}
            isDisabled={signUp.isPending}
          >
            {signUp.isPending ? 'Creating account…' : 'Create account'}
          </OnlineButton>
          <AuthFooterLink
            prompt="Already have an account?"
            action="Sign in"
            onPress={() => router.back()}
          />
        </View>

        <GoogleSignInButton />
      </View>
    </Screen>
  );
}
