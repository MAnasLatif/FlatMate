import { Chip, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { Payment } from '../api';
import { paymentStatus } from '../rules';

/** One payment in a list: who paid whom, the amount, the date and its status. */
export function PaymentRow({
  payment,
  description,
  onPress,
}: {
  payment: Payment;
  description: string;
  onPress: () => void;
}) {
  const status = paymentStatus(payment.status);
  const amount = `${formatMinorUnits(payment.amountMinor)} ${payment.currency}`;
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${description} ${amount}, ${status.label}`}
      className="flex-row items-center gap-3"
    >
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
