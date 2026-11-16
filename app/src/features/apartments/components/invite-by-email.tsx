import Ionicons from '@expo/vector-icons/Ionicons';
import {
  FieldError,
  InputGroup,
  Label,
  Spinner,
  TextField,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { emailSchema } from '@/features/auth/schemas';
import { userErrorMessage } from '@/lib/errors';

import { INVITE_EMAIL_ERROR_MESSAGES } from '../errors';
import { useJoinCodeActions } from '../hooks';

/**
 * Emails someone the apartment's join code, from the Join code card. The
 * send button sits inside the field.
 */
export function InviteByEmail({ apartmentId }: { apartmentId: string }) {
  const { sendEmail } = useJoinCodeActions(apartmentId);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const accent = useThemeColor('accent');

  const send = () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message);
      return;
    }
    setEmailError(undefined);
    sendEmail.mutate(parsed.data, {
      onSuccess: () => {
        setSentTo(parsed.data);
        Keyboard.dismiss();
        setEmail('');
      },
    });
  };

  const sendError = sendEmail.error
    ? userErrorMessage(
        sendEmail.error,
        'The invite could not be sent. Try again.',
        INVITE_EMAIL_ERROR_MESSAGES,
      )
    : undefined;

  return (
    <View className="gap-2">
      <TextField isInvalid={emailError !== undefined || sendError !== undefined}>
        <Label>Invite by email</Label>
        <InputGroup>
          <InputGroup.Input
            variant="secondary"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailError(undefined);
              setSentTo(undefined);
              sendEmail.reset();
            }}
            placeholder="friend@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <InputGroup.Suffix>
            <OnlineButton
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={send}
              isDisabled={sendEmail.isPending}
              accessibilityLabel={sendEmail.isPending ? 'Sending invite' : 'Send invite'}
            >
              {sendEmail.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Ionicons name="send" size={20} color={accent} />
              )}
            </OnlineButton>
          </InputGroup.Suffix>
        </InputGroup>
        <FieldError>{emailError ?? sendError}</FieldError>
      </TextField>
      {sentTo ? (
        <Typography.Paragraph
          type="body-sm"
          className="text-success"
          accessibilityLiveRegion="polite"
        >
          Invite sent to {sentTo}.
        </Typography.Paragraph>
      ) : null}
    </View>
  );
}
