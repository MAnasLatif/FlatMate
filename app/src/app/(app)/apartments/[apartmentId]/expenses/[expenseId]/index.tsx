import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { ExpenseDisputes } from '@/features/disputes/components/expense-disputes';
import { ExpenseDetailView } from '@/features/expenses/components/expense-detail';
import { ExpenseItemSection } from '@/features/inventory/components/expense-item-section';
import { ExpensePayActions } from '@/features/payments/components/expense-pay-actions';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

export default function ExpenseDetailScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  useMarkSeen(unreadMatches.expense(apartmentId, expenseId));
  return (
    <ExpenseDetailView apartmentId={apartmentId} expenseId={expenseId}>
      <ExpensePayActions apartmentId={apartmentId} expenseId={expenseId} />
      <ExpenseDisputes apartmentId={apartmentId} expenseId={expenseId} />
      <ExpenseItemSection apartmentId={apartmentId} expenseId={expenseId} />
    </ExpenseDetailView>
  );
}
