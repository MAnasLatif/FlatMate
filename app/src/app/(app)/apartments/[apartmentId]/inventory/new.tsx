import { useApartmentId } from '@/features/apartments/hooks';
import { ItemFormScreen } from '@/features/inventory/components/item-form';

export default function NewInventoryItemScreen() {
  return <ItemFormScreen apartmentId={useApartmentId()} />;
}
