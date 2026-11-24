import { useApartmentId } from '@/features/apartments/hooks';
import { InventoryList } from '@/features/inventory/components/inventory-list';

export default function InventoryScreen() {
  return <InventoryList apartmentId={useApartmentId()} />;
}
