import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { PayMember } from '@/features/payments/components/pay-member';

export default function PayScreen() {
  const apartmentId = useApartmentId();
  const { memberId, expenseId } = useLocalSearchParams<{ memberId: string; expenseId?: string }>();
  return (
    <PayMember
      apartmentId={apartmentId}
      memberId={memberId}
      expenseId={typeof expenseId === 'string' ? expenseId : null}
    />
  );
}
