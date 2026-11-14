import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import { confirmEmailWithCode, resendConfirmationCode } from '@/features/auth/api';
import { AuthFooterLink } from '@/features/auth/components/auth-footer-link';
import { AuthHeader } from '@/features/auth/components/auth-header';
import { EmailCodeField } from '@/features/auth/components/email-code-field';
import { authErrorMessage } from '@/features/auth/errors';
import { formatCountdown, useResendCountdown } from '@/features/auth/resend-countdown';
import { emailCodeSchema } from '@/features/auth/schemas';

export default function VerifyEmailScreen() {
  const { email, codeSent } = useLocalSearchParams<{ email?: string; codeSent?: string }>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  // From sign-in no code was sent, so a new one can be asked for at once.
  const countdown = useResendCountdown(codeSent === '1');

  // Success signs the user in, and the navigator switches to the app.
  const verify = useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      confirmEmailWithCode(input.email, input.code),
  });
  const resend = useMutation({
    mutationFn: resendConfirmationCode,
    onSuccess: countdown.restart,
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
      <View className="flex-1 gap-8">
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

        <View className="gap-3">
          <OnlineButton onPress={submit} isDisabled={verify.isPending}>
            {verify.isPending ? 'Checking…' : 'Confirm email'}
          </OnlineButton>

          <View className="items-center">
            <AuthFooterLink
              prompt="Didn't get the code?"
              action={
                countdown.remaining > 0
                  ? `Resend in ${formatCountdown(countdown.remaining)}`
                  : resend.isPending
                    ? 'Sending…'
                    : 'Resend'
              }
              onPress={() => resend.mutate(email)}
              isDisabled={resend.isPending || countdown.remaining > 0}
            />
            <Typography.Paragraph type="body-xs" color="muted" className="text-center">
              Check your spam folder too.
            </Typography.Paragraph>
          </View>

          {/* Skipping does not confirm the account: signing in later brings the
              person back here for a code, since the project requires it. */}
          <Button variant="ghost" onPress={() => router.dismissTo('/sign-in')}>
            Skip for now
          </Button>
        </View>
      </View>
    </Screen>
  );
}
