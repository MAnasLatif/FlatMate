import { zodResolver } from '@hookform/resolvers/zod';
import { isAuthError } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button, Typography } from 'heroui-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, View } from 'react-native';
import { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import {
  confirmEmailChangeCode,
  requestEmailChange,
  resendEmailChangeCodes,
} from '@/features/auth/api';
import { AuthFooterLink } from '@/features/auth/components/auth-footer-link';
import { EmailCodeField } from '@/features/auth/components/email-code-field';
import { authErrorMessage } from '@/features/auth/errors';
import { formatCountdown, useResendCountdown } from '@/features/auth/resend-countdown';
import { emailCodeSchema, emailSchema } from '@/features/auth/schemas';
import { useSession } from '@/features/auth/session-provider';

import { confirmBothCodes, EmailChangeCodeError } from '../email-change';

function changeEmailErrorMessage(error: unknown): string {
  if (isAuthError(error) && error.code === 'email_exists') {
    return 'Another FlatMate account already uses this email.';
  }
  return authErrorMessage(error);
}

/** The change-email modal opened from the profile screen. */
export function ChangeEmail() {
  const { session } = useSession();
  const currentEmail = session?.user.email ?? '';
  const [newEmail, setNewEmail] = useState<string | null>(null);

  return (
    <Screen padTop={false}>
      {newEmail === null ? (
        <NewEmailStep currentEmail={currentEmail} onCodesSent={setNewEmail} />
      ) : (
        <CodesStep
          currentEmail={currentEmail}
          newEmail={newEmail}
          onUseDifferentEmail={() => setNewEmail(null)}
        />
      )}
    </Screen>
  );
}

function NewEmailStep({
  currentEmail,
  onCodesSent,
}: {
  currentEmail: string;
  onCodesSent: (newEmail: string) => void;
}) {
  const schema = z.object({
    email: emailSchema.refine(
      (email) => email !== currentEmail.toLowerCase(),
      'This is already your email.',
    ),
  });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });
  const request = useMutation({
    mutationFn: (email: string) => requestEmailChange(email),
    onSuccess: (_data, email) => onCodesSent(email),
  });

  return (
    <>
      <Typography.Paragraph color="muted">
        We will send a code to your new email and another to {currentEmail}, to make sure both are
        yours.
      </Typography.Paragraph>
      <FormAlert message={request.error ? changeEmailErrorMessage(request.error) : null} />
      <TextInputField
        control={form.control}
        name="email"
        label="New email"
        icon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        autoFocus
      />
      <View className="gap-3">
        <OnlineButton
          onPress={() => void form.handleSubmit((values) => request.mutate(values.email))()}
          isDisabled={request.isPending}
        >
          {request.isPending ? 'Sending…' : 'Send codes'}
        </OnlineButton>
        <Button variant="ghost" onPress={() => router.back()} isDisabled={request.isPending}>
          Cancel
        </Button>
      </View>
    </>
  );
}

type CodeErrors = { new?: string; current?: string };

function CodesStep({
  currentEmail,
  newEmail,
  onUseDifferentEmail,
}: {
  currentEmail: string;
  newEmail: string;
  onUseDifferentEmail: () => void;
}) {
  const [codes, setCodes] = useState({ new: '', current: '' });
  // A code that was accepted cannot be used twice, so if the other one fails
  // only that one is sent again.
  const [confirmed, setConfirmed] = useState({ new: false, current: false });
  const [codeErrors, setCodeErrors] = useState<CodeErrors>({});
  const countdown = useResendCountdown(true);

  const verify = useMutation({
    mutationFn: () =>
      confirmBothCodes({
        emails: { new: newEmail, current: currentEmail },
        codes,
        confirmed,
        confirm: confirmEmailChangeCode,
        onConfirmed: (side) => setConfirmed((state) => ({ ...state, [side]: true })),
      }),
    onError: (error) => {
      if (error instanceof EmailChangeCodeError) {
        setCodeErrors({ [error.side]: changeEmailErrorMessage(error.cause) });
      }
    },
    onSuccess: () => {
      router.back();
      Alert.alert('Email changed', `Sign in with ${newEmail} from now on.`);
    },
  });
  const resend = useMutation({
    mutationFn: () => resendEmailChangeCodes(newEmail),
    onSuccess: () => {
      // New codes replace the old ones, including one already accepted.
      setCodes({ new: '', current: '' });
      setConfirmed({ new: false, current: false });
      setCodeErrors({});
      countdown.restart();
    },
  });

  const submit = () => {
    const errors: CodeErrors = {};
    if (!confirmed.new && !emailCodeSchema.safeParse(codes.new).success) {
      errors.new = 'Enter the 6-digit code sent to your new email.';
    }
    if (!confirmed.current && !emailCodeSchema.safeParse(codes.current).success) {
      errors.current = 'Enter the 6-digit code sent to your current email.';
    }
    setCodeErrors(errors);
    if (!errors.new && !errors.current) verify.mutate();
  };

  const error =
    verify.error && !(verify.error instanceof EmailChangeCodeError) ? verify.error : null;

  return (
    <>
      <Typography.Paragraph color="muted">
        Enter both codes. Each email has its own, and they expire in one hour.
      </Typography.Paragraph>
      <FormAlert message={error ? changeEmailErrorMessage(error) : null} />
      <FormAlert message={resend.error ? changeEmailErrorMessage(resend.error) : null} />
      {confirmed.new ? (
        <FormAlert status="success" message={`Code for ${newEmail} accepted.`} />
      ) : (
        <EmailCodeField
          label={`Code sent to ${newEmail}`}
          value={codes.new}
          onChange={(code) => setCodes((state) => ({ ...state, new: code }))}
          error={codeErrors.new}
        />
      )}
      {confirmed.current ? (
        <FormAlert status="success" message={`Code for ${currentEmail} accepted.`} />
      ) : (
        <EmailCodeField
          label={`Code sent to ${currentEmail}`}
          value={codes.current}
          onChange={(code) => setCodes((state) => ({ ...state, current: code }))}
          error={codeErrors.current}
        />
      )}
      <View className="gap-3">
        <OnlineButton onPress={submit} isDisabled={verify.isPending}>
          {verify.isPending ? 'Checking…' : 'Confirm new email'}
        </OnlineButton>
        <View className="items-center">
          <AuthFooterLink
            prompt="Didn't get them?"
            action={
              countdown.remaining > 0
                ? `Resend in ${formatCountdown(countdown.remaining)}`
                : resend.isPending
                  ? 'Sending…'
                  : 'Resend'
            }
            onPress={() => resend.mutate()}
            isDisabled={resend.isPending || countdown.remaining > 0}
          />
          <AuthFooterLink action="Use a different email" onPress={onUseDifferentEmail} />
        </View>
      </View>
    </>
  );
}
