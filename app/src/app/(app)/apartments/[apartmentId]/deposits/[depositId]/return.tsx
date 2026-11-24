import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { ReturnDeposit } from '@/features/deposits/components/share-forms';

export default function ReturnDepositScreen() {
  const apartmentId = useApartmentId();
  const { depositId } = useLocalSearchParams<{ depositId: string }>();
  return <ReturnDeposit apartmentId={apartmentId} depositId={depositId} />;
}
