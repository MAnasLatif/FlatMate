import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useHasUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

/** Opens debt simplification (FR-06.5), with a dot for proposals and answers. */
export function SimplifyLink({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('muted');
  const unread = useHasUnread(unreadMatches.debtTransfers(apartmentId));
  return (
    <PressableFeedback
      onPress={() =>
        router.push({ pathname: '/apartments/[apartmentId]/simplify', params: { apartmentId } })
      }
      accessibilityRole="button"
      accessibilityLabel={withUnread('Simplify debts', unread)}
      accessibilityHint="Shows ways to settle with fewer payments"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <Ionicons name="git-merge-outline" size={22} color={iconColor} />
          <View className="flex-1">
            <Typography.Paragraph>Simplify debts</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              Fewer payments for the same result, once everyone involved agrees
            </Typography.Paragraph>
          </View>
          {unread ? <UnreadDot /> : null}
          <Ionicons name="chevron-forward" size={20} color={iconColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
