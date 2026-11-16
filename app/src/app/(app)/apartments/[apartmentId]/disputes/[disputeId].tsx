import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { DisputeDetailView } from '@/features/disputes/components/dispute-detail';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

export default function DisputeScreen() {
  const apartmentId = useApartmentId();
  const { disputeId } = useLocalSearchParams<{ disputeId: string }>();
  useMarkSeen(unreadMatches.dispute(apartmentId, disputeId));
  return <DisputeDetailView apartmentId={apartmentId} disputeId={disputeId} />;
}
