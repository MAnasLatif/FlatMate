import { useLocalSearchParams } from 'expo-router';
import Stack from 'expo-router/stack';

import { useApartmentId, useMembers } from '@/features/apartments/hooks';
import { SettleWith } from '@/features/settlement/components/settle-with';

export default function SettleWithScreen() {
  const apartmentId = useApartmentId();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const members = useMembers(apartmentId);
  const name =
    members.data?.find((member) => member.userId === memberId)?.displayName ?? 'This member';
  return (
    <>
      <Stack.Screen options={{ title: `Settle with ${name}` }} />
      <SettleWith apartmentId={apartmentId} memberId={memberId} name={name} />
    </>
  );
}
