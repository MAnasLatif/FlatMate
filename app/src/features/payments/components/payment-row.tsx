import { Chip, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { Payment } from '../api';
import { paymentStatus } from '../rules';

/**
 * One payment in a list: who paid whom, the amount, the date and its status.
 * A red dot means a notification about it is unread.
 */
export function PaymentRow({
  payment,
  description,
  unread = false,
  onPress,
}: {
  payment: Payment;
  description: string;
  unread?: boolean;
  onPress: () => void;
}) {
  const status = paymentStatus(payment.status);
  const amount = `${formatMinorUnits(payment.amountMinor)} ${payment.currency}`;
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={withUnread(`${description} ${amount}, ${status.label}`, unread)}
      className="flex-row items-center gap-3"
    >
      {unread ? <UnreadDot /> : null}
      <View className="flex-1 gap-0.5">
        <Typography.Paragraph type="body-sm">
          {description} {amount}
        </Typography.Paragraph>
        <Typography.Paragraph type="body-xs" color="muted">
          {formatDate(payment.paidAt)}
        </Typography.Paragraph>
      </View>
      <Chip size="sm" variant="soft" color={status.color}>
        {status.label}
      </Chip>
    </PressableFeedback>
  );
}
