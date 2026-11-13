import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { DisputeDetailView } from '@/features/disputes/components/dispute-detail';

export default function DisputeScreen() {
  const apartmentId = useApartmentId();
  const { disputeId } = useLocalSearchParams<{ disputeId: string }>();
  return <DisputeDetailView apartmentId={apartmentId} disputeId={disputeId} />;
}
