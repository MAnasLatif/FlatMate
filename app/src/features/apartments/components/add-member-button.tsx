import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomSheet,
  FieldError,
  InputGroup,
  Label,
  PressableFeedback,
  Spinner,
  TextField,
  Typography,
  useBottomSheetAwareHandlers,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { HEADER_ICON_SIZE } from '@/components/screen-transitions';
import { emailSchema } from '@/features/auth/schemas';
import { userErrorMessage } from '@/lib/errors';

import { INVITE_EMAIL_ERROR_MESSAGES } from '../errors';
import { useJoinCodeActions } from '../hooks';

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

/** Invites someone by emailing them the apartment's join code. */
export function AddMemberSheet({
  apartmentId,
  isOpen,
  onOpenChange,
}: {
  apartmentId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  // Each opening starts a fresh form.
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
          <InviteOptions key={openCount} apartmentId={apartmentId} />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function InviteOptions({ apartmentId }: { apartmentId: string }) {
  const { sendEmail } = useJoinCodeActions(apartmentId);
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
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
    <View className="gap-5">
      <View className="gap-1">
        <BottomSheet.Title>Add member</BottomSheet.Title>
        <BottomSheet.Description>
          Email someone the apartment&apos;s join code. You let them in when they ask to join.
        </BottomSheet.Description>
      </View>

      <TextField isInvalid={emailError !== undefined || sendError !== undefined}>
        <Label>Email</Label>
        <InputGroup>
          {/* The grey field reads better than the white one on the white sheet. */}
          <InputGroup.Input
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
