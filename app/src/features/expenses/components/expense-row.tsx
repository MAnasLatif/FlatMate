import { Card, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { ExpenseListItem } from '../api';
import { ExpenseStatusChips } from './expense-status';

/** One expense in the feed: what it was, when, how much, and its status. Opens its details. */
export function ExpenseRow({
  expense,
  onPress,
}: {
  expense: ExpenseListItem;
  onPress: () => void;
}) {
  const details = [
    formatDate(expense.expense_date),
    expense.category?.name,
    expense.paid_status === 'unpaid' && expense.due_date
      ? `due ${formatDate(expense.due_date)}`
      : undefined,
  ].filter(Boolean);
  const isVoid = expense.status === 'void';

  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens the expense"
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <Typography.Paragraph numberOfLines={1} color={isVoid ? 'muted' : 'default'}>
              {expense.title}
            </Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
              {details.join(' · ')}
            </Typography.Paragraph>
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
