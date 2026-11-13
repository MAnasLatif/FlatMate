import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { EditExpense } from '@/features/expenses/components/edit-expense';

export default function EditExpenseScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  return <EditExpense apartmentId={apartmentId} expenseId={expenseId} />;
}
