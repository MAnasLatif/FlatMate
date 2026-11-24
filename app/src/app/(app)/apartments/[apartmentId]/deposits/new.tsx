import { useApartmentId } from '@/features/apartments/hooks';
import { RecordDeposit } from '@/features/deposits/components/record-deposit';

export default function NewDepositScreen() {
  return <RecordDeposit apartmentId={useApartmentId()} />;
}
