import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { RefundShare } from '@/features/deposits/components/share-forms';

export default function RefundShareScreen() {
  const apartmentId = useApartmentId();
  const { depositId } = useLocalSearchParams<{ depositId: string }>();
  return <RefundShare apartmentId={apartmentId} depositId={depositId} />;
}
