import Ionicons from '@expo/vector-icons/Ionicons';
import { PressableFeedback, Spinner, useThemeColor } from 'heroui-native';
import { Alert, Share } from 'react-native';

import { HEADER_ICON_SIZE } from '@/components/screen-transitions';
import { useIsOnline } from '@/lib/network';
import { userErrorMessage } from '@/lib/errors';

import { INVITE_VALID_DAYS } from '../api';
import { APARTMENT_ERROR_MESSAGES } from '../errors';
import { useInviteActions } from '../hooks';

/**
 * For admins, in the members screen's top bar: makes a new join code and
 * opens the phone's share sheet with it. The code is shown only now, since the
 * database keeps a hash; codes can be revoked in the apartment's settings.
 */
export function SendInviteButton({
  apartmentId,
  apartmentName,
}: {
  apartmentId: string;
  apartmentName: string;
}) {
  const iconColor = useThemeColor('foreground');
  const isOnline = useIsOnline();
  const { create } = useInviteActions(apartmentId);

  const send = () =>
    create.mutate(INVITE_VALID_DAYS, {
      onSuccess: (code) =>
        void Share.share({
          message: `Join ${apartmentName} on FlatMate with this code: ${code}. It works for ${INVITE_VALID_DAYS} days.`,
        }),
      onError: (error) =>
        Alert.alert(
          'Could not create an invite',
          userErrorMessage(error, 'Try again.', APARTMENT_ERROR_MESSAGES),
        ),
    });

  if (create.isPending) {
    return <Spinner size="sm" accessibilityLabel="Creating an invite" />;
  }
  return (
    <PressableFeedback
      onPress={send}
      isDisabled={!isOnline}
      accessibilityRole="button"
      accessibilityLabel="Send invite"
      accessibilityHint={
        isOnline ? 'Creates a join code and shares it' : 'Connect to the internet to send an invite'
      }
      hitSlop={8}
    >
      <Ionicons name="person-add-outline" size={HEADER_ICON_SIZE} color={iconColor} />
    </PressableFeedback>
  );
}
