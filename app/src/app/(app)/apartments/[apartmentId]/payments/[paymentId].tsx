import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { PaymentDetailView } from '@/features/payments/components/payment-detail';

export default function PaymentScreen() {
  const apartmentId = useApartmentId();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  return <PaymentDetailView apartmentId={apartmentId} paymentId={paymentId} />;
}
