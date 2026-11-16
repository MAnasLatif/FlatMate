import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { PaymentDetailView } from '@/features/payments/components/payment-detail';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

export default function PaymentScreen() {
  const apartmentId = useApartmentId();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  useMarkSeen(unreadMatches.payment(apartmentId, paymentId));
  return <PaymentDetailView apartmentId={apartmentId} paymentId={paymentId} />;
}
