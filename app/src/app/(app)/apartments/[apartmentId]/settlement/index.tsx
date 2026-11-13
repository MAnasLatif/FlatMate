import { useApartmentId } from '@/features/apartments/hooks';
import { SettlementOverview } from '@/features/settlement/components/settlement-overview';

export default function SettlementScreen() {
  const apartmentId = useApartmentId();
  return <SettlementOverview apartmentId={apartmentId} />;
}
