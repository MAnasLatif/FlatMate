import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useHasUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

/** Opens the apartment's security deposits (FR-10.4), with a dot for changes to the user's share. */
export function DepositLink({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('muted');
  const unread = useHasUnread(unreadMatches.deposits(apartmentId));

  return (
    <PressableFeedback
      onPress={() =>
        router.push({ pathname: '/apartments/[apartmentId]/deposits', params: { apartmentId } })
      }
      accessibilityRole="button"
      accessibilityLabel={withUnread('Deposit', unread)}
      accessibilityHint="Shows the security deposit and each person's share"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <Ionicons name="shield-checkmark-outline" size={22} color={iconColor} />
          <View className="flex-1">
            <Typography.Paragraph>Deposit</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              The security deposit and each person&apos;s share
            </Typography.Paragraph>
          </View>
          {unread ? <UnreadDot /> : null}
          <Ionicons name="chevron-forward" size={20} color={iconColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
