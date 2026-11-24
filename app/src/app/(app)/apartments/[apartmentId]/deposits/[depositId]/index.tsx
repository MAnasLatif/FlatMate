import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { DepositDetail } from '@/features/deposits/components/deposit-detail';

export default function DepositScreen() {
  const apartmentId = useApartmentId();
  const { depositId } = useLocalSearchParams<{ depositId: string }>();
  return <DepositDetail apartmentId={apartmentId} depositId={depositId} />;
}
