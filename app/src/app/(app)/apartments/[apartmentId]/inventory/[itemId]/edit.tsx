import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { ItemFormScreen } from '@/features/inventory/components/item-form';

export default function EditInventoryItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <ItemFormScreen apartmentId={useApartmentId()} itemId={itemId} />;
}
