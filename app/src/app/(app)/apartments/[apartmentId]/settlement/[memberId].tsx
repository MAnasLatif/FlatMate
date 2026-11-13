import { useLocalSearchParams } from 'expo-router';
import Stack from 'expo-router/stack';

import { useApartmentId } from '@/features/apartments/hooks';
import { SettleWith } from '@/features/settlement/components/settle-with';
import { useNameOf } from '@/features/settlement/names';

export default function SettleWithScreen() {
  const apartmentId = useApartmentId();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const name = useNameOf(apartmentId, [memberId])(memberId);
  return (
    <>
      <Stack.Screen options={{ title: `Settle with ${name}` }} />
      <SettleWith apartmentId={apartmentId} memberId={memberId} name={name} />
    </>
  );
}
