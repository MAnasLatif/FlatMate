import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { ExpenseDisputes } from '@/features/disputes/components/expense-disputes';
import { ExpenseDetailView } from '@/features/expenses/components/expense-detail';
import { ExpensePayActions } from '@/features/payments/components/expense-pay-actions';

export default function ExpenseDetailScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  return (
    <ExpenseDetailView apartmentId={apartmentId} expenseId={expenseId}>
      <ExpensePayActions apartmentId={apartmentId} expenseId={expenseId} />
      <ExpenseDisputes apartmentId={apartmentId} expenseId={expenseId} />
    </ExpenseDetailView>
  );
}
