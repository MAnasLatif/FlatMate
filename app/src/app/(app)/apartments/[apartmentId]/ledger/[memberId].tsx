import { useLocalSearchParams } from 'expo-router';
import Stack from 'expo-router/stack';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment, useApartmentId, useMembers } from '@/features/apartments/hooks';
import { PairLedger } from '@/features/expenses/components/pair-ledger';
import { PairPayments } from '@/features/payments/components/pair-payments';
import { userErrorMessage } from '@/lib/errors';

export default function PairLedgerScreen() {
  const apartmentId = useApartmentId();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);

  if (apartment.isPending || members.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  if (apartment.isError || members.isError) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(
            apartment.error ?? members.error,
            'Could not load this member.',
          )}
          onRetry={() => {
            void apartment.refetch();
            void members.refetch();
          }}
        />
      </Screen>
    );
  }

  const name =
    members.data.find((member) => member.userId === memberId)?.displayName ?? 'This member';
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <PairLedger
        apartmentId={apartmentId}
        counterpartyId={memberId}
        name={name}
        currency={apartment.data.currency}
      >
        <PairPayments apartmentId={apartmentId} counterpartyId={memberId} name={name} />
      </PairLedger>
    </>
  );
}
