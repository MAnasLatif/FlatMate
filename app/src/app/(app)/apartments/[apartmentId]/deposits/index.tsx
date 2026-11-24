import { useApartmentId } from '@/features/apartments/hooks';
import { DepositList } from '@/features/deposits/components/deposit-list';

export default function DepositsScreen() {
  return <DepositList apartmentId={useApartmentId()} />;
}
