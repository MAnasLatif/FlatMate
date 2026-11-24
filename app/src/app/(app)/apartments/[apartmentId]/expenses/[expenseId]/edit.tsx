import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { EditExpense } from '@/features/expenses/components/edit-expense';
import { RoomSplitPanel } from '@/features/rooms/components/room-split-panel';

export default function EditExpenseScreen() {
  const apartmentId = useApartmentId();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  return (
    <EditExpense
      apartmentId={apartmentId}
      expenseId={expenseId}
      renderAfterSplit={(props) => <RoomSplitPanel apartmentId={apartmentId} {...props} />}
    />
  );
}
