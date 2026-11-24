import { router } from 'expo-router';
import { Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { StatusChip } from '@/components/status-chip';
import { formatMoney } from '@/features/apartments/currencies';
import { parseAmountToMinorUnits } from '@/lib/money';

import { useQueuedExpenses } from '../offline-queue-hooks';
import type { QueuedExpense } from '../offline-queue';

/**
 * On the dashboard: expenses saved offline on this phone that the server has
 * not accepted yet. They are sent by themselves when the connection is back;
 * one turned down shows why and opens to be fixed. None counts in any total
 * until it is sent.
 */
export function QueuedExpenses({
  apartmentId,
  currency,
}: {
  apartmentId: string;
  currency: string;
}) {
  const queued = useQueuedExpenses(apartmentId);
  const expenses = queued.data ?? [];
  if (expenses.length === 0) return null;

  return (
    <Card>
      <Card.Body className="gap-3">
        <View className="gap-1">
          <Card.Title>Not sent yet</Card.Title>
          <Typography.Paragraph type="body-xs" color="muted">
            Saved on this phone while offline. They are sent by themselves when you are back online,
            and count nowhere until then.
          </Typography.Paragraph>
        </View>
        <Separator />
        {expenses.map((expense) => (
          <QueuedRow
            key={expense.id}
            expense={expense}
            currency={currency}
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/expenses/new',
                params: { apartmentId, queuedId: expense.id },
              })
            }
          />
        ))}
      </Card.Body>
    </Card>
  );
}

function QueuedRow({
  expense,
  currency,
  onPress,
}: {
  expense: QueuedExpense;
  currency: string;
  onPress: () => void;
}) {
  const title = expense.draft.title.trim() || 'Untitled expense';
  const amountMinor = parseAmountToMinorUnits(expense.draft.amount);
  const amount = amountMinor !== null ? formatMoney(amountMinor, currency) : '';
  const state = expense.failure === null ? 'Waiting to send' : 'Not sent';
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}, ${state}${expense.failure ? `: ${expense.failure}` : ''}`}
      accessibilityHint={
        expense.failure ? 'Opens it to fix and send' : 'Opens it to change or delete'
      }
    >
      <View className="gap-1 py-1">
        <View className="flex-row items-center justify-between gap-2">
          <Typography.Paragraph type="body-sm" numberOfLines={1} className="shrink">
            {title}
          </Typography.Paragraph>
          <View className="flex-row items-center gap-2">
            <Typography.Paragraph type="body-sm" weight="semibold">
              {amount}
            </Typography.Paragraph>
            <StatusChip
              size="sm"
              variant="soft"
              color={expense.failure === null ? 'warning' : 'danger'}
            >
              {state}
            </StatusChip>
          </View>
        </View>
        {expense.failure ? (
          <Typography.Paragraph type="body-xs" className="text-danger">
            {expense.failure}
          </Typography.Paragraph>
        ) : null}
      </View>
    </PressableFeedback>
  );
}
