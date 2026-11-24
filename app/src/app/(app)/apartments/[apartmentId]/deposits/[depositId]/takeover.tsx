import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { TakeOverShare } from '@/features/deposits/components/share-forms';

export default function TakeOverShareScreen() {
  const apartmentId = useApartmentId();
  const { depositId } = useLocalSearchParams<{ depositId: string }>();
  return <TakeOverShare apartmentId={apartmentId} depositId={depositId} />;
}
