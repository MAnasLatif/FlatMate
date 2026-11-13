import { Chip } from 'heroui-native';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import type { ExpenseListItem, ExpenseStatus } from '../api';

type ChipColor = NonNullable<ComponentProps<typeof Chip>['color']>;

/** What each status is called, kept distinct as the ledger rules require. */
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, { label: string; color: ChipColor }> = {
  provisional: { label: 'Provisional', color: 'warning' },
  disputed: { label: 'Disputed', color: 'danger' },
  final: { label: 'Final', color: 'success' },
  void: { label: 'Void', color: 'default' },
};

function isExpenseStatus(value: string): value is ExpenseStatus {
  return value in EXPENSE_STATUS_LABELS;
}

/** The expense's status, plus whether it is a bill nobody has paid yet. */
export function ExpenseStatusChips({
  expense,
}: {
  expense: Pick<ExpenseListItem, 'status' | 'paid_status'>;
}) {
  const status = isExpenseStatus(expense.status) ? EXPENSE_STATUS_LABELS[expense.status] : null;
  return (
    <View className="flex-row flex-wrap justify-end gap-1">
      {expense.paid_status === 'unpaid' && expense.status !== 'void' ? (
        <Chip size="sm" variant="soft" color="accent">
          Unpaid bill
        </Chip>
      ) : null}
      {status ? (
        <Chip size="sm" variant="soft" color={status.color}>
          {status.label}
        </Chip>
      ) : null}
    </View>
  );
}
