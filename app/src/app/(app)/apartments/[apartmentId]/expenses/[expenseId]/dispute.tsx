import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { RaiseDispute } from '@/features/disputes/components/raise-dispute';

export default function RaiseDisputeScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  return <RaiseDispute apartmentId={apartmentId} expenseId={expenseId} />;
}
