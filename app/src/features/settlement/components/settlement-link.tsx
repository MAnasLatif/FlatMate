import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useHasUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

/**
 * Opens the settlement: this period with each person, past periods and what
 * carried forward. The dashboard has no Settle up button, so members reach it
 * from the members screen, and payments, offsets and closed periods show their
 * dot here (decision 0008).
 */
export function SettlementLink({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('muted');
  const unread = useHasUnread(unreadMatches.settlement(apartmentId));

  return (
    <PressableFeedback
      onPress={() =>
        router.push({ pathname: '/apartments/[apartmentId]/settlement', params: { apartmentId } })
      }
      accessibilityRole="button"
      accessibilityLabel={withUnread('Settlement', unread)}
      accessibilityHint="Shows this period with each person, past periods and what carried forward"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <Ionicons name="swap-horizontal-outline" size={22} color={iconColor} />
          <View className="flex-1">
            <Typography.Paragraph>Settlement</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              This period, past periods and what carried forward
            </Typography.Paragraph>
          </View>
          {unread ? <UnreadDot /> : null}
          <Ionicons name="chevron-forward" size={20} color={iconColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
