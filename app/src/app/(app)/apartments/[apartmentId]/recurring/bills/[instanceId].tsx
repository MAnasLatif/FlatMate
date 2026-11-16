import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { EnterBillScreen } from '@/features/recurring/components/enter-bill-screen';

export default function EnterBillRoute() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  return <EnterBillScreen apartmentId={useApartmentId()} instanceId={instanceId} />;
}
