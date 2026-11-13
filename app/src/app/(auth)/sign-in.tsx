import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button, Separator, Typography } from 'heroui-native';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { Screen } from '@/components/screen';
import { signInWithEmail } from '@/features/auth/api';
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
      <AuthHeader title="Welcome back" subtitle="Sign in to see your apartments." />

      <FormAlert message={errorMessage} />

      <View className="gap-4">
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
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
      </View>

      <View className="gap-3">
        <Button
          onPress={() => void form.handleSubmit((values) => signIn.mutate(values))()}
          isDisabled={signIn.isPending}
        >
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button variant="ghost" onPress={() => router.push('/forgot-password')}>
          Forgot your password?
        </Button>
      </View>

      <GoogleSignInButton />

      <Separator />

      <View className="items-center gap-2">
        <Typography.Paragraph color="muted">New to FlatMate?</Typography.Paragraph>
        <Button variant="secondary" onPress={() => router.push('/sign-up')}>
          Create an account
        </Button>
      </View>
    </Screen>
  );
}
