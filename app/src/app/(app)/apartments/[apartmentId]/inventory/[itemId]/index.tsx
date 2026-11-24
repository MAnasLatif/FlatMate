import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { ItemDetail } from '@/features/inventory/components/item-detail';

export default function InventoryItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <ItemDetail apartmentId={useApartmentId()} itemId={itemId} />;
}
