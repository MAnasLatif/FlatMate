import { Card, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { UnreadDot } from '@/features/notifications/components/unread-dot';
import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { ExpenseListItem } from '../api';
import { ExpenseStatusChips } from './expense-status';

/**
 * One expense in the feed: what it was, when, how much, what the user receives
 * or sends for it, and its status. Opens
 * its details. A red dot means a notification about it, or a dispute on it, is
 * unread.
 */
export function ExpenseRow({
  expense,
  unread = false,
  onPress,
}: {
  expense: ExpenseListItem;
  unread?: boolean;
  onPress: () => void;
}) {
  const details = [
    formatDate(expense.expense_date),
    [expense.category?.name, expense.category_detail].filter(Boolean).join(' · '),
    expense.paid_status === 'unpaid' && expense.due_date
      ? `due ${formatDate(expense.due_date)}`
      : undefined,
  ].filter(Boolean);
  const isVoid = expense.status === 'void';
  const position = expense.my_position_minor;

  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={unread ? 'New. Opens the expense' : 'Opens the expense'}
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              {unread ? <UnreadDot /> : null}
              <Typography.Paragraph
                numberOfLines={1}
                color={isVoid ? 'muted' : 'default'}
                className="shrink"
              >
                {expense.title}
              </Typography.Paragraph>
            </View>
            <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
              {details.join(' · ')}
            </Typography.Paragraph>
            {position ? (
              <Typography.Paragraph
                type="body-xs"
                weight="semibold"
                className={position > 0 ? 'text-success' : 'text-danger'}
              >
                {position > 0 ? "You'll receive" : "You'll send"}{' '}
                {formatMinorUnits(Math.abs(position))} {expense.currency}
              </Typography.Paragraph>
            ) : null}
          </View>
          <View className="items-end gap-1">
            <Typography.Paragraph
              weight="semibold"
              color={isVoid ? 'muted' : 'default'}
              className={isVoid ? 'line-through' : undefined}
            >
              {formatMinorUnits(expense.amount_minor)} {expense.currency}
            </Typography.Paragraph>
            <ExpenseStatusChips expense={expense} />
          </View>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
