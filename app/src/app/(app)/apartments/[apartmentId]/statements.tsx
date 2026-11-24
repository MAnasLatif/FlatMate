import { useApartmentId } from '@/features/apartments/hooks';
import { StatementsList } from '@/features/statements/components/statements-list';

export default function StatementsScreen() {
  return <StatementsList apartmentId={useApartmentId()} />;
}
