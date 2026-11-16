import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import {
  BottomSheet,
  Button,
  FieldError,
  Input,
  Label,
  PressableFeedback,
  Separator,
  TextField,
  Typography,
  useBottomSheetAwareHandlers,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { Keyboard, Share, View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { HEADER_ICON_SIZE } from '@/components/screen-transitions';
import { emailSchema } from '@/features/auth/schemas';
import { userErrorMessage } from '@/lib/errors';

import { INVITE_VALID_DAYS } from '../api';
import { APARTMENT_ERROR_MESSAGES, INVITE_EMAIL_ERROR_MESSAGES } from '../errors';
import { useInviteActions } from '../hooks';

/**
 * For admins, in the members screen's top bar: opens the `AddMemberSheet`.
 * The sheet lives in the screen, not the header: inside the header it only
 * opened on a second tap.
 */
export function AddMemberButton({ onPress }: { onPress: () => void }) {
  const iconColor = useThemeColor('foreground');
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add member"
      accessibilityHint="Opens ways to invite someone"
      hitSlop={8}
    >
      <Ionicons name="person-add-outline" size={HEADER_ICON_SIZE} color={iconColor} />
    </PressableFeedback>
  );
}

/** Invites someone: emails them a join code, or copies or shares one. */
export function AddMemberSheet({
  apartmentId,
  apartmentName,
  isOpen,
  onOpenChange,
}: {
  apartmentId: string;
  apartmentName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  // Each opening starts a fresh form, and a fresh code if one is shared.
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenCount((count) => count + 1);
  }

  return (
    // Always mounted: a sheet mounted already open does not appear.
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBehavior="interactive" keyboardBlurBehavior="restore">
          <InviteOptions key={openCount} apartmentId={apartmentId} apartmentName={apartmentName} />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function InviteOptions({
  apartmentId,
  apartmentName,
}: {
  apartmentId: string;
  apartmentName: string;
}) {
  const { create, sendEmail } = useInviteActions(apartmentId);
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  // The code is shown only when created, so one is made the first time it is
  // copied or shared and reused for both.
  const [code, setCode] = useState<string>();
  const [copied, setCopied] = useState(false);
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

  const withCode = (act: (message: string) => void) => {
    const message = (value: string) =>
      `Join ${apartmentName} on FlatMate with this code: ${value}. It works for ${INVITE_VALID_DAYS} days.`;
    if (code) {
      act(message(code));
      return;
    }
    create.mutate(INVITE_VALID_DAYS, {
      onSuccess: (created) => {
        setCode(created);
        act(message(created));
      },
    });
  };

  const copy = () =>
    withCode((message) => {
      void Clipboard.setStringAsync(message).then(() => setCopied(true));
    });
  const share = () => withCode((message) => void Share.share({ message }));

  const sendError = sendEmail.error
    ? userErrorMessage(
        sendEmail.error,
        'The invite could not be sent. Try again.',
        INVITE_EMAIL_ERROR_MESSAGES,
      )
    : undefined;

  return (
    <View className="gap-5">
      <View className="gap-1">
        <BottomSheet.Title>Add member</BottomSheet.Title>
        <BottomSheet.Description>
          Email someone a join code, or share one yourself. A code works for {INVITE_VALID_DAYS}{' '}
          days, and you let the person in when they ask to join.
        </BottomSheet.Description>
      </View>

      <View className="gap-3">
        <TextField isInvalid={emailError !== undefined || sendError !== undefined}>
          <Label>Email</Label>
          {/* The grey field reads better than the white one on the white sheet. */}
          <Input
            variant="secondary"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailError(undefined);
              setSentTo(undefined);
              sendEmail.reset();
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="friend@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={send}
          />
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
        <OnlineButton onPress={send} isDisabled={sendEmail.isPending}>
          {sendEmail.isPending ? 'Sending…' : 'Send invite'}
        </OnlineButton>
      </View>

      <View className="flex-row items-center gap-3">
        <Separator className="flex-1" />
        <Typography.Paragraph type="body-xs" color="muted">
          or share a code
        </Typography.Paragraph>
        <Separator className="flex-1" />
      </View>

      <View className="gap-2">
        <View className="flex-row gap-3">
          <OnlineButton
            variant="secondary"
            className="flex-1"
            onPress={copy}
            isDisabled={create.isPending}
            accessibilityLabel="Copy invite"
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={accent} />
            <Button.Label>{copied ? 'Copied' : 'Copy invite'}</Button.Label>
          </OnlineButton>
          <OnlineButton
            variant="secondary"
            className="flex-1"
            onPress={share}
            isDisabled={create.isPending}
            accessibilityLabel="Share invite"
          >
            <Ionicons name="share-outline" size={18} color={accent} />
            <Button.Label>Share invite</Button.Label>
          </OnlineButton>
        </View>
        {create.error ? (
          <Typography.Paragraph type="body-sm" className="text-danger">
            {userErrorMessage(
              create.error,
              'Could not create a code. Try again.',
              APARTMENT_ERROR_MESSAGES,
            )}
          </Typography.Paragraph>
        ) : null}
      </View>
    </View>
  );
}
