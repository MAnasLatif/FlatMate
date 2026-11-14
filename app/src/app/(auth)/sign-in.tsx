import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinkButton } from 'heroui-native';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { PasswordField } from '@/components/form/password-field';
import { TextInputField } from '@/components/form/text-input-field';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import { signInWithEmail } from '@/features/auth/api';
import { AuthFooterLink } from '@/features/auth/components/auth-footer-link';
import { AuthHeader } from '@/features/auth/components/auth-header';
import { GoogleSignInButton } from '@/features/auth/components/google-sign-in-button';
import { authErrorMessage, isEmailNotConfirmed } from '@/features/auth/errors';
import { signInSchema } from '@/features/auth/schemas';

type FormInput = z.input<typeof signInSchema>;
type FormOutput = z.output<typeof signInSchema>;

export default function SignInScreen() {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const signIn = useMutation({
    mutationFn: (values: FormOutput) => signInWithEmail(values.email, values.password),
    onError: (error, values) => {
      // An account that was never confirmed goes to the code screen instead.
      if (isEmailNotConfirmed(error)) {
        router.push({ pathname: '/verify-email', params: { email: values.email } });
      }
    },
  });

  const errorMessage =
    signIn.error && !isEmailNotConfirmed(signIn.error) ? authErrorMessage(signIn.error) : null;

  return (
    <Screen>
      <View className="flex-1 gap-8">
        <AuthHeader title="Welcome back" subtitle="Sign in to see your apartments and balances." />

        <FormAlert message={errorMessage} />

        <View className="gap-4">
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
          <View className="gap-1">
            <PasswordField
              control={form.control}
              name="password"
              label="Password"
              placeholder="Your password"
              purpose="current"
            />
            <View className="items-end">
              <LinkButton size="sm" onPress={() => router.push('/forgot-password')}>
                <LinkButton.Label className="text-accent">Forgot password?</LinkButton.Label>
              </LinkButton>
            </View>
          </View>
        </View>

        <OnlineButton
          size="lg"
          onPress={() => void form.handleSubmit((values) => signIn.mutate(values))()}
          isDisabled={signIn.isPending}
        >
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </OnlineButton>

        <GoogleSignInButton />
      </View>

      <AuthFooterLink
        prompt="New to FlatMate?"
        action="Create an account"
        onPress={() => router.push('/sign-up')}
      />
    </Screen>
  );
}
