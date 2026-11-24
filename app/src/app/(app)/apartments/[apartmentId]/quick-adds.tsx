import { useApartmentId } from '@/features/apartments/hooks';
import { QuickAddList } from '@/features/quick-add/components/quick-add-list';

export default function QuickAddsScreen() {
  return <QuickAddList apartmentId={useApartmentId()} />;
}
