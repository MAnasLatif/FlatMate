import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Typography } from 'heroui-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { Screen } from '@/components/screen';
import { confirmEmailWithCode, resendConfirmationCode } from '@/features/auth/api';
import { AuthHeader } from '@/features/auth/components/auth-header';
import { EmailCodeField } from '@/features/auth/components/email-code-field';
import { authErrorMessage } from '@/features/auth/errors';
import { emailCodeSchema } from '@/features/auth/schemas';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Success signs the user in, and the navigator switches to the app.
  const verify = useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      confirmEmailWithCode(input.email, input.code),
  });
  const resend = useMutation({
    mutationFn: resendConfirmationCode,
    onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
  });

  if (!email) {
    return (
      <Screen>
        <AuthHeader title="Check your email" subtitle="Start again from the sign-in screen." />
        <Button onPress={() => router.replace('/sign-in')}>Go to sign in</Button>
      </Screen>
    );
  }

  const submit = () => {
    const parsed = emailCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    setCodeError(undefined);
    verify.mutate({ email, code: parsed.data });
  };

  const error = verify.error ?? resend.error;

  return (
    <Screen>
      <AuthHeader title="Check your email" subtitle={`We sent a 6-digit code to ${email}.`} />

      <FormAlert message={error ? authErrorMessage(error) : null} />
      <FormAlert
        status="success"
        message={resend.isSuccess && !resend.error ? 'A new code is on its way.' : null}
      />

      <EmailCodeField
        value={code}
        onChange={(next) => {
          setCode(next);
          setCodeError(undefined);
        }}
        error={codeError}
      />

      <Button onPress={submit} isDisabled={verify.isPending}>
        {verify.isPending ? 'Checking…' : 'Confirm email'}
      </Button>

      <View className="items-center gap-2">
        <Typography.Paragraph color="muted" className="text-center">
          No email? Check your spam folder, or ask for a new code.
        </Typography.Paragraph>
        <Button
          variant="ghost"
          onPress={() => resend.mutate(email)}
          isDisabled={resend.isPending || cooldown > 0}
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </Button>
      </View>
    </Screen>
  );
}
