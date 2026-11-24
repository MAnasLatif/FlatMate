import { useApartmentId } from '@/features/apartments/hooks';
import { SimplifyDebts } from '@/features/debt-transfers/components/simplify-debts';

export default function SimplifyScreen() {
  return <SimplifyDebts apartmentId={useApartmentId()} />;
}
