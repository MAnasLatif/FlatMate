import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { ExpenseDetailView } from '@/features/expenses/components/expense-detail';

export default function ExpenseDetailScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  return <ExpenseDetailView apartmentId={apartmentId} expenseId={expenseId} />;
}
