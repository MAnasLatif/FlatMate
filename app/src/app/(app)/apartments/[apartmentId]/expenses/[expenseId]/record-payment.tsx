import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { RecordPayment } from '@/features/expenses/components/record-payment';

export default function RecordPaymentScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  return <RecordPayment apartmentId={apartmentId} expenseId={expenseId} />;
}
